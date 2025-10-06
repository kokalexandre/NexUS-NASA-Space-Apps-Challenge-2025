"""
API Flask minimaliste pour servir les prédictions.
Lance avec: python folder/api.py
Accessible sur http://localhost:5000
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from predict import predict_exoplanet_pretty

app = Flask(__name__)
CORS(app)  # Permet les requêtes depuis votre site HTML

# Définition des champs attendus
EXPECTED_FIELDS = {
    "mission": {"type": str, "required": True, "options": ["kepler", "k2", "tess"]},
    "t_mag": {"type": float, "required": False, "min": 0, "max": 20},
    "period_days": {"type": float, "required": True, "min": 0},
    "dur_hr": {"type": float, "required": False, "min": 0},
    "depth_ppm": {"type": float, "required": True, "min": 0},
    "rprstar": {"type": float, "required": False, "min": 0, "max": 1},
    "a_over_rstar": {"type": float, "required": False, "min": 0},
    "radius_rearth": {"type": float, "required": False, "min": 0},
    "insol_earth": {"type": float, "required": False, "min": 0},
    "eq_temp_k": {"type": float, "required": False, "min": 0},
    "teff_k": {"type": float, "required": False, "min": 0},
    "logg_cgs": {"type": float, "required": False},
    "star_rad_rsun": {"type": float, "required": False, "min": 0},
    "ra_deg": {"type": float, "required": False, "min": 0, "max": 360},
    "dec_deg": {"type": float, "required": False, "min": -90, "max": 90},
}


def validate_input(data):
    """Valide les données d'entrée."""
    errors = []
    validated = {}
    
    for field, specs in EXPECTED_FIELDS.items():
        value = data.get(field)
        
        if specs.get("required", False) and (value is None or value == ""):
            errors.append(f"Le champ '{field}' est requis")
            continue
        
        if value is None or value == "":
            continue
        
        try:
            if specs["type"] == float:
                validated[field] = float(value)
                
                if "min" in specs and validated[field] < specs["min"]:
                    errors.append(f"'{field}' doit être >= {specs['min']}")
                if "max" in specs and validated[field] > specs["max"]:
                    errors.append(f"'{field}' doit être <= {specs['max']}")
                    
            elif specs["type"] == str:
                validated[field] = str(value).lower().strip()
                
                if "options" in specs and validated[field] not in specs["options"]:
                    errors.append(f"'{field}' doit être parmi {specs['options']}")
                    
        except (ValueError, TypeError):
            errors.append(f"'{field}' a un format invalide")
    
    return validated, errors


@app.route('/api/predict', methods=['POST'])
def predict():
    """Endpoint de prédiction."""
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "Aucune donnée fournie"}), 400
        
        validated_data, errors = validate_input(data)
        
        if errors:
            return jsonify({"error": "Erreurs de validation", "details": errors}), 400
        
        threshold = data.get('threshold')
        result = predict_exoplanet_pretty(validated_data, threshold=threshold)
        
        return jsonify({
            "success": True,
            "prediction": result,
            "input_data": validated_data
        })
        
    except Exception as e:
        return jsonify({"error": f"Erreur: {str(e)}"}), 500


@app.route('/api/fields', methods=['GET'])
def get_fields():
    """Retourne la liste des champs attendus."""
    return jsonify(EXPECTED_FIELDS)


@app.route('/api/health', methods=['GET'])
def health():
    """Vérifie que l'API fonctionne."""
    return jsonify({"status": "ok", "message": "API opérationnelle"})


if __name__ == '__main__':
    print("🚀 API de prédiction démarrée sur http://localhost:5000")
    print("📡 CORS activé - accessible depuis votre site HTML")
    app.run(debug=True, host='0.0.0.0', port=5000)