"""
Prédicteur unitaire pour le modèle AutoGluon (exoplanètes).

- Charge le TabularPredictor une seule fois (lazy, global cache)
- Accepte une observation sous forme de dict (colonnes de la dataset encodée)
- Aligne les colonnes sur celles vues à l'entraînement (ajoute NaN pour manquants, ignore colonnes inconnues)
- Force dtypes critiques (mission -> category, t_mag -> float)
- Retourne label, proba positive, et seuil utilisé

Utilisation rapide :
    from predict import predict_exoplanet

    sample = {
        "mission": "kepler",
        "t_mag": 11.3,
        "period_days": 3.52,
        "depth_ppm": 1200.0,
        # ... toutes les autres features pertinentes de ta dataset encodée ...
    }

    out = predict_exoplanet(sample)                       # seuil par défaut
    out = predict_exoplanet(sample, threshold=0.436)      # seuil custom

Exemple d'entrée :
{
        "mission": "kepler",
        "t_mag": 12.1,
        "period_days": 3.52,
        "dur_hr": 3.0,
        "depth_ppm": 15000,      # ~1.5% -> gros transit
        "rprstar": 0.105,        # Rp/R* ~ 0.1
        "a_over_rstar": 7.5,
        "radius_rearth": 13.0,   # ~Jupiter
        "insol_earth": 1200.0,
        "eq_temp_k": 1500.0,
        "teff_k": 6100.0,
        "logg_cgs": 4.30,
        "star_rad_rsun": 1.15,
        "ra_deg": 292.1,
        "dec_deg": 48.2,
    }
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from autogluon.tabular import TabularPredictor

# === Configuration ===
DEFAULT_MODEL_DIR = os.environ.get("EXO_MODEL_DIR", "/Users/jeremy/Desktop/spaceappshtml3/folder/autogluon_exoplanets")
# Seuil par défaut optimisé sur la validation (tu as observé ~0.436)
DEFAULT_THRESHOLD = float(os.environ.get("EXO_DEFAULT_THRESHOLD", "0.436"))

# Colonnes pour lesquelles on veut verrouiller un dtype utile
CATEGORICAL_COLS = {"mission"}           # 'kepler' / 'k2' / 'tess' (ou autres)
NUMERIC_FORCE_COLS = {"t_mag"}           # utile si présent


# ---------- Helpers ----------

# Clean les entrées 
def _coerce_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Force quelques dtypes utiles, sans casser si la colonne n'existe pas."""
    for col in CATEGORICAL_COLS:
        if col in df.columns:
            df[col] = df[col].astype("category")
    for col in NUMERIC_FORCE_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _get_feature_names_safe(predictor: TabularPredictor) -> Optional[list]:
    """
    Récupère la liste de features attendues par le modèle sans s'appuyer
    sur des attributs privés. Essaie plusieurs chemins compatibles AG.
    Rend le programme comptaible avec plusieurs versions de Autogluon
    """
    for attr in ("features", "features_in", "feature_names"):
        if hasattr(predictor, attr):
            val = getattr(predictor, attr)
            if isinstance(val, (list, tuple)):
                return list(val)

    try:
        if hasattr(predictor, "feature_metadata") and predictor.feature_metadata is not None:
            feats = predictor.feature_metadata.get_features()
            if feats:
                return list(feats)
    except Exception:
        pass

    return None

#Charge le modèle
@lru_cache(maxsize=1)
def _load_predictor(model_dir: str = DEFAULT_MODEL_DIR) -> TabularPredictor:
    """Charge et met en cache le predictor AutoGluon."""
    if not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f"Répertoire de modèle introuvable : {model_dir}\n"
        )
    return TabularPredictor.load(model_dir)


# ---------- API principale ----------

def predict_exoplanet(
    sample: Dict[str, Any],
    threshold: Optional[float] = None,
    model_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Prédit pour une seule observation.

    Args:
        sample: dict -> clés = noms de colonnes de la dataset encodée
        threshold: seuil (0..1) pour transformer la proba positive en classe ; si None, utilise DEFAULT_THRESHOLD
        model_dir: chemin du modèle (facultatif, sinon DEFAULT_MODEL_DIR)

    Returns:
        {
            "label": int (0/1) ou str selon labels du modèle,
            "proba_positive": float,
            "threshold": float,
            "positive_class": valeur de la classe positive dans le modèle,
            "class_labels": liste des labels du modèle,
            "used_features": liste des features réellement passées au modèle
        }
    """
    predictor = _load_predictor(model_dir or DEFAULT_MODEL_DIR)
    feats_expected = _get_feature_names_safe(predictor)

    # Construire un DataFrame 1-ligne à partir du dict
    df_in = pd.DataFrame([sample])

    # Harmoniser/forcer quelques dtypes
    df_in = _coerce_dtypes(df_in)

    # Si on connaît la liste de features attendue, on l'applique strictement
    if feats_expected is not None:
        # Ajoute colonnes manquantes (remplies NaN), enlève colonnes inconnues
        for col in feats_expected:
            if col not in df_in.columns:
                df_in[col] = np.nan
        df_in = df_in[feats_expected]
        used_features = feats_expected
    else:
        # Laisse AG gérer; on conserve l'ordre actuel
        used_features = list(df_in.columns)

    # === Prédiction proba ===
    proba = predictor.predict_proba(df_in)
    # Selon la version d'AG, predict_proba peut renvoyer:
    # - un DataFrame (colonnes = labels), ou
    # - une Series/array (proba de la classe positive uniquement).
    positive_class = getattr(predictor, "positive_class", None)
    class_labels = getattr(predictor, "class_labels", None)

    if isinstance(proba, pd.DataFrame):
        # Trouver la colonne de la classe positive
        if positive_class is None:
            # Fallback: on suppose que la classe "1" (ou True) existe
            if 1 in proba.columns:
                pos_col = 1
            elif "1" in proba.columns:
                pos_col = "1"
            else:
                # Dernier recours : prendre la colonne avec la proba la plus "élevée" en moyenne
                pos_col = proba.columns[np.argmax(proba.mean().values)]
        else:
            pos_col = positive_class
        proba_pos = float(proba.iloc[0][pos_col])
    else:
        # Series/array -> déjà la proba de la classe positive
        proba_pos = float(np.asarray(proba)[0])

    thr = float(DEFAULT_THRESHOLD if threshold is None else threshold)
    # Déterminer le label positif (par ex. 1) et produire la prédiction
    if class_labels is not None and positive_class is not None:
        # On renvoie le label original du modèle (ex: 0/1), en suivant le seuil
        label_pred = positive_class if proba_pos >= thr else next(
            (c for c in class_labels if c != positive_class), 0
        )
    else:
        # Fallback binaire standard 0/1
        label_pred = int(proba_pos >= thr)

    return {
        "label": label_pred,
        "proba_positive": proba_pos,
        "threshold": thr,
        "positive_class": positive_class,
        "class_labels": list(class_labels) if class_labels is not None else [0, 1],
        "used_features": used_features,
    }

LABEL_MAP = {0: "Non-planète (FP)", 1: "Planète/PC"}

def predict_exoplanet_pretty(sample: dict, threshold: float = None) -> dict:
    res = predict_exoplanet(sample, threshold=threshold)
    label_text = LABEL_MAP.get(res["label"], str(res["label"]))
    return {
        "decision": label_text,
    }
