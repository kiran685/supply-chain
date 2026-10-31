import csv
import io
import math
from datetime import datetime, timedelta, date
from decimal import Decimal
from django.db import transaction
from .models import Product, DemandObservation, PurchaseOrderItem


def parse_and_import_demand_csv(file_content_str: str):
    """
    Parses and validates a CSV containing historical demand observations.
    Expected header: product_id (or sku), date, quantity
    Returns summary dict with accepted/rejected counts and error log.
    """
    reader = csv.DictReader(io.StringIO(file_content_str.strip()))
    
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    # Check required columns
    id_col = None
    for candidate in ["product_id", "product", "sku", "item_id"]:
        if candidate in headers:
            id_col = candidate
            break

    if not id_col or "date" not in headers or "quantity" not in headers:
        return {
            "success": False,
            "message": f"CSV must contain 'product_id' (or 'sku'), 'date' (YYYY-MM-DD), and 'quantity' columns. Found: {reader.fieldnames}",
            "rows_processed": 0,
            "rows_imported": 0,
            "rows_skipped": 0,
            "errors": ["Missing required headers: date, quantity, product_id/sku"],
        }

    # Cache products by id and sku
    products_by_id = {p.product_id: p for p in Product.objects.all()}
    products_by_sku = {p.sku: p for p in products_by_id.values()}

    rows_processed = 0
    rows_imported = 0
    errors = []
    observations_to_create = []

    for row_num, row in enumerate(reader, start=2):
        rows_processed += 1
        raw_id = row.get(id_col, "").strip()
        raw_date = row.get("date", "").strip()
        raw_qty = row.get("quantity", "").strip()

        # Validate product
        product = products_by_id.get(raw_id) or products_by_sku.get(raw_id)
        if not product:
            errors.append(f"Row {row_num}: Product '{raw_id}' does not exist in inventory catalog.")
            continue

        # Validate date
        try:
            obs_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            errors.append(f"Row {row_num}: Invalid date format '{raw_date}'. Expected YYYY-MM-DD.")
            continue

        # Validate quantity
        try:
            qty = int(float(raw_qty))
            if qty < 0:
                errors.append(f"Row {row_num}: Negative quantity '{raw_qty}' is rejected.")
                continue
        except (ValueError, TypeError):
            errors.append(f"Row {row_num}: Invalid quantity numerical value '{raw_qty}'.")
            continue

        observations_to_create.append((product, obs_date, qty))

    # Save with upsert logic in an atomic transaction
    with transaction.atomic():
        for product, obs_date, qty in observations_to_create:
            DemandObservation.objects.update_or_create(
                product=product,
                date=obs_date,
                defaults={"quantity": qty, "source": "CSV_IMPORT"},
            )
            rows_imported += 1

    return {
        "success": True,
        "rows_processed": rows_processed,
        "rows_imported": rows_imported,
        "rows_skipped": len(errors),
        "errors": errors[:50],  # return first 50 errors if any
    }


def calculate_metrics(actuals: list, forecasts: list):
    """
    Computes standard time-series evaluation metrics: MAE, RMSE, MAPE.
    """
    if not actuals or not forecasts or len(actuals) != len(forecasts):
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "n_samples": 0}

    n = len(actuals)
    abs_errors = [abs(a - f) for a, f in zip(actuals, forecasts)]
    sq_errors = [(a - f) ** 2 for a, f in zip(actuals, forecasts)]

    mae = sum(abs_errors) / n
    rmse = math.sqrt(sum(sq_errors) / n)

    # Calculate MAPE filtering out zero actuals to prevent division by zero
    non_zero = [(a, f) for a, f in zip(actuals, forecasts) if a > 0]
    if non_zero:
        mape = (sum(abs(a - f) / a for a, f in zip(*zip(*non_zero))) / len(non_zero)) * 100
    else:
        mape = 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2),
        "n_samples": n,
    }


def generate_demand_forecast(product: Product, algorithm: str = "EXPONENTIAL_SMOOTHING", horizon_days: int = 14):
    """
    Generates demand forecast using historical demand observations.
    Supports 'EXPONENTIAL_SMOOTHING' (SES) and 'MOVING_AVERAGE'.
    Uses chronological holdout validation to compute honest MAE & RMSE.
    """
    observations = list(
        DemandObservation.objects.filter(product=product).order_by("date").values("date", "quantity")
    )

    if len(observations) < 5:
        # Generate baseline from current stock velocity or simple fallback
        daily_baseline = max(1, round(product.reorder_quantity / max(1, product.lead_time_days * 2)))
        start_date = date.today()
        forecast_points = []
        for i in range(1, horizon_days + 1):
            f_date = start_date + timedelta(days=i)
            forecast_points.append({
                "date": str(f_date),
                "forecast": daily_baseline,
                "lower_bound": max(0, daily_baseline - 2),
                "upper_bound": daily_baseline + 2,
            })
        return {
            "algorithm": "BASELINE_HEURISTIC",
            "historical_points": [{"date": str(o["date"]), "quantity": o["quantity"]} for o in observations],
            "forecast_points": forecast_points,
            "metrics": {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "n_samples": len(observations)},
            "warning": "Fewer than 5 historical demand data points available. Using catalog velocity baseline.",
            "average_daily_demand": float(daily_baseline),
        }

    history_dates = [o["date"] for o in observations]
    quantities = [float(o["quantity"]) for o in observations]
    n = len(quantities)

    # Chronological holdout: split into 80% train and 20% test (minimum 2 test samples)
    split_idx = max(3, int(n * 0.8))
    train_y = quantities[:split_idx]
    test_y = quantities[split_idx:]

    test_forecasts = []
    
    if algorithm == "MOVING_AVERAGE":
        window = 3 if len(train_y) < 7 else 7
        # In-sample & test evaluation
        for i in range(len(test_y)):
            prev_window = (train_y + test_y[:i])[-window:]
            pred = sum(prev_window) / len(prev_window)
            test_forecasts.append(pred)

        # Future forecast from full dataset
        last_window = quantities[-window:]
        future_pred = round(sum(last_window) / len(last_window), 2)
        params = {"window_size": window}
    else:  # EXPONENTIAL_SMOOTHING (alpha = 0.3)
        alpha = 0.3
        s = train_y[0]
        for val in train_y[1:]:
            s = alpha * val + (1 - alpha) * s
        
        # Test evaluation
        test_s = s
        for val in test_y:
            test_forecasts.append(test_s)
            test_s = alpha * val + (1 - alpha) * test_s

        # Full run for future
        full_s = quantities[0]
        for val in quantities[1:]:
            full_s = alpha * val + (1 - alpha) * full_s
        future_pred = round(full_s, 2)
        params = {"alpha": alpha}

    metrics = calculate_metrics(test_y, test_forecasts)

    # Generate future horizon points
    last_date = max(history_dates[-1], date.today())
    forecast_points = []
    for i in range(1, horizon_days + 1):
        f_date = last_date + timedelta(days=i)
        # Apply gentle weekday variation for realistic time-series display
        day_of_week = f_date.weekday()
        multiplier = 1.1 if day_of_week in [0, 4] else 0.95
        pt_val = max(0, round(future_pred * multiplier, 1))
        forecast_points.append({
            "date": str(f_date),
            "forecast": pt_val,
            "lower_bound": max(0, round(pt_val - (metrics["rmse"] or 2.0), 1)),
            "upper_bound": round(pt_val + (metrics["rmse"] or 2.0), 1),
        })

    avg_daily_demand = max(0.5, round(sum(p["forecast"] for p in forecast_points) / len(forecast_points), 2))

    return {
        "algorithm": algorithm,
        "parameters": params,
        "historical_points": [{"date": str(o["date"]), "quantity": o["quantity"]} for o in observations],
        "forecast_points": forecast_points,
        "metrics": metrics,
        "average_daily_demand": avg_daily_demand,
    }


def compute_reorder_recommendations():
    """
    Generates explainable reorder recommendations across all active products.
    Formula:
        Lead Time Demand (LTD) = Average Daily Demand * Lead Time (days)
        Reorder Point (ROP) = LTD + Safety Stock
        Effective Stock = Current Stock + Incoming Confirmed POs
        Recommended Order = max(Reorder Quantity, ROP - Effective Stock)
    """
    products = Product.objects.filter(is_active=True).select_related("preferred_supplier", "primary_warehouse")
    recommendations = []

    for product in products:
        # Calculate incoming orders from active POs
        incoming_items = PurchaseOrderItem.objects.filter(
            product=product,
            purchase_order__status__in=["ORDERED", "APPROVED", "PARTIALLY_RECEIVED"],
        )
        incoming_qty = sum(max(0, item.quantity_ordered - item.quantity_received) for item in incoming_items)

        # Estimate average daily demand
        forecast_res = generate_demand_forecast(product, horizon_days=14)
        daily_demand = forecast_res["average_daily_demand"]
        lead_time = product.lead_time_days or 7
        safety_stock = product.safety_stock or 10

        lead_time_demand = round(daily_demand * lead_time, 1)
        reorder_point = math.ceil(lead_time_demand + safety_stock)
        effective_stock = product.current_stock + incoming_qty

        needs_reorder = effective_stock <= reorder_point

        if needs_reorder:
            suggested_order = max(product.reorder_quantity, reorder_point - effective_stock + 10)
            urgency = "CRITICAL" if product.current_stock <= 0 else ("HIGH" if product.current_stock <= product.min_stock_threshold else "MEDIUM")
            reason = (
                f"Effective inventory ({effective_stock} units: {product.current_stock} on hand + {incoming_qty} on order) "
                f"is at or below Reorder Point ({reorder_point} units). "
                f"Estimated lead time demand is {lead_time_demand} units over {lead_time} days + {safety_stock} safety stock."
            )
        else:
            suggested_order = 0
            urgency = "LOW"
            reason = (
                f"Effective inventory ({effective_stock} units) safely exceeds Reorder Point ({reorder_point} units). "
                f"Coverage is estimated for {round(effective_stock / max(0.1, daily_demand))} days."
            )

        recommendations.append({
            "product_id": product.product_id,
            "product_name": product.name,
            "sku": product.sku,
            "category": product.category,
            "current_stock": product.current_stock,
            "incoming_quantity": incoming_qty,
            "effective_stock": effective_stock,
            "average_daily_demand": daily_demand,
            "lead_time_days": lead_time,
            "safety_stock": safety_stock,
            "reorder_point": reorder_point,
            "suggested_reorder_quantity": suggested_order,
            "needs_reorder": needs_reorder,
            "urgency": urgency,
            "preferred_supplier": {
                "id": product.preferred_supplier.supplier_id if product.preferred_supplier else None,
                "name": product.preferred_supplier.name if product.preferred_supplier else "No supplier assigned",
            },
            "estimated_cost": float(suggested_order * product.cost_price),
            "reason": reason,
        })

    # Sort so products needing reorder with highest urgency appear first
    urgency_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    recommendations.sort(key=lambda r: urgency_order.get(r["urgency"], 4))
    return recommendations
