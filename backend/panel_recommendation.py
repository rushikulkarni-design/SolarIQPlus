
import re
from brand_database import BRAND_DATABASE


PRIORITY_WEIGHTS = {
    "balanced": {
        "budget": 25,
        "technology": 20,
        "efficiency": 15,
        "warranty": 10,
        "rating": 10,
        "property": 10,
        "installation": 10,
    },
    "lowest_cost": {
        "budget": 40,
        "technology": 15,
        "efficiency": 10,
        "warranty": 10,
        "rating": 5,
        "property": 10,
        "installation": 10,
    },
    "maximum_efficiency": {
        "budget": 15,
        "technology": 20,
        "efficiency": 30,
        "warranty": 10,
        "rating": 10,
        "property": 5,
        "installation": 10,
    },
    "long_term_value": {
        "budget": 20,
        "technology": 15,
        "efficiency": 15,
        "warranty": 20,
        "rating": 10,
        "property": 10,
        "installation": 10,
    },
}


def _efficiency_values(value):
    numbers = re.findall(r"\d+(?:\.\d+)?", str(value or ""))
    if not numbers:
        return 0.0, 0.0
    return float(numbers[0]), float(numbers[-1])


def _budget_category(budget):
    if budget < 120000:
        return "Budget"
    if budget < 300000:
        return "Medium"
    return "Premium"


def _choose_technology(budget, priority, roof_area_sqft):
    if priority == "maximum_efficiency" or (
        roof_area_sqft is not None and roof_area_sqft < 250
    ):
        return "HJT" if budget >= 300000 else "TOPCon"

    if priority == "lowest_cost" or budget < 120000:
        return "Mono PERC"

    if priority == "long_term_value":
        return "TOPCon" if budget >= 120000 else "Mono PERC"

    return "HJT" if budget >= 300000 else "TOPCon"


def _budget_score(price, category):
    if price == category:
        return 100
    if category == "Medium" and price == "MediumHigh":
        return 85
    if category == "Premium" and price == "MediumHigh":
        return 90
    if category == "Premium" and price == "Medium":
        return 85
    if category == "Budget" and price == "Medium":
        return 65
    if category == "Budget" and price == "MediumHigh":
        return 40
    if category == "Budget" and price == "Premium":
        return 20
    if category == "Medium" and price == "Premium":
        return 55
    if category == "Medium" and price == "Budget":
        return 90
    if category == "Premium" and price == "Budget":
        return 90
    return 60


def _score_brand(brand, details, technology, category,
                 property_type, roof_area_sqft, priority):
    weights = PRIORITY_WEIGHTS[priority]

    # Every criterion is normalized to 0–100 before weighting.
    low, high = _efficiency_values(details.get("efficiency"))
    efficiency_score = min(100, max(0, high / 25.0 * 100))

    warranty_match = re.search(r"\d+", details.get("warranty", ""))
    warranty_years = int(warranty_match.group()) if warranty_match else 0
    warranty_score = min(100, warranty_years / 30.0 * 100)

    rating = float(details.get("rating", 0))
    rating_score = min(100, max(0, rating / 5.0 * 100))

    if property_type == "commercial":
        suitable_brands = {
            "Premier Energies", "Adani Solar", "Vikram Solar"
        }
    else:
        suitable_brands = {
            "Waaree", "Tata Power Solar", "RenewSys"
        }
    property_score = 100 if brand in suitable_brands else 80

    installation_score = 100
    if roof_area_sqft is not None and roof_area_sqft < 250:
        # Prefer higher efficiency for limited roof area.
        installation_score = efficiency_score

    components = {
        "budget": _budget_score(details.get("price", "Medium"), category),
        "technology": 100,  # incompatible brands are filtered out
        "efficiency": efficiency_score,
        "warranty": warranty_score,
        "rating": rating_score,
        "property": property_score,
        "installation": installation_score,
    }

    breakdown = {
        key: round(components[key] * weight / 100, 2)
        for key, weight in weights.items()
    }

    # The weights total exactly 100, and each component is 0–100.
    score = round(sum(breakdown.values()), 2)
    score = max(0, min(100, score))

    reasons = [
        f"{technology} compatible",
        f"budget fit: {components['budget']:.0f}/100",
        f"efficiency: {details.get('efficiency', 'Unknown')}",
        f"warranty: {details.get('warranty', 'Unknown')}",
    ]

    if roof_area_sqft is not None and roof_area_sqft < 250:
        reasons.append("efficiency weighted for limited roof space")

    if priority == "lowest_cost":
        reasons.append("cost-focused ranking")
    elif priority == "maximum_efficiency":
        reasons.append("efficiency-focused ranking")
    elif priority == "long_term_value":
        reasons.append("warranty-focused ranking")

    return {
        "name": brand,
        "technology": technology,
        "efficiency": details.get("efficiency"),
        "warranty": details.get("warranty"),
        "warranty_years": warranty_years,
        "price": details.get("price"),
        "rating": rating,
        "origin": details.get("origin"),
        "headquarters": details.get("headquarters"),
        "best_for": details.get("best_for"),
        "ai_score": score,
        "score_breakdown": breakdown,
        "recommendation_reason": "; ".join(reasons),
    }


def recommend_panels(
    budget,
    panel_technology=None,
    property_type="residential",
    roof_area_sqft=None,
    required_kw=None,
    priority="balanced",
    top_n=3,
):
    budget = max(0.0, float(budget or 0))
    property_type = str(property_type or "residential").lower()
    priority = str(priority or "balanced").lower()

    if priority not in PRIORITY_WEIGHTS:
        priority = "balanced"

    if roof_area_sqft is not None:
        try:
            roof_area_sqft = max(0.0, float(roof_area_sqft))
        except (TypeError, ValueError):
            roof_area_sqft = None

    technology = panel_technology or _choose_technology(
        budget, priority, roof_area_sqft
    )
    category = _budget_category(budget)

    results = []

    for brand, details in BRAND_DATABASE.items():
        if technology not in details.get("technology", []):
            continue

        item = _score_brand(
            brand, details, technology, category,
            property_type, roof_area_sqft, priority
        )
        results.append(item)

    results.sort(
        key=lambda item: (item["ai_score"], item["rating"]),
        reverse=True,
    )

    for rank, item in enumerate(results, start=1):
        item["rank"] = rank

    return results[:max(1, int(top_n))]
