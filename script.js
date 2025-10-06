// Données d'exoplanètes chargées depuis le fichier CSV
let exoplanetsData = [];
let autoChangeInterval;
let countdownInterval;
let timeRemaining = 30;

// Variables globales pour l'animation
let currentPlanetIndex = 0;
let canvas;
let planetSystem3D;

// Fonction pour charger les données CSV
async function loadCSVData() {
    try {
        const response = await fetch('src/exoplanets_unified.csv');
        const csvText = await response.text();
        
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        
        exoplanetsData = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',');
            if (values.length < headers.length) continue;
            
            const planet = {
                label: values[0] || 'Exoplanète',
                mission: values[1] || 'Inconnue',
                object_id: values[2] || 'N/A',
                period_days: parseFloat(values[3]) || 0,
                dur_hr: parseFloat(values[4]) || 0,
                depth_ppm: parseFloat(values[5]) || 0,
                rprstar: parseFloat(values[6]) || 0,
                a_over_rstar: parseFloat(values[7]) || 0,
                radius_rearth: parseFloat(values[8]) || 0,
                insol_earth: parseFloat(values[9]) || 0,
                eq_temp_k: parseFloat(values[10]) || 0,
                teff_k: parseFloat(values[11]) || 0,
                logg_cgs: parseFloat(values[12]) || 0,
                star_rad_rsun: parseFloat(values[13]) || 0,
                ra_deg: parseFloat(values[14]) || 0,
                dec_deg: parseFloat(values[15]) || 0,
                t_mag: parseFloat(values[16]) || 0
            };
            
            // Filtrer uniquement les exoplanètes confirmées (label = 1) et données valides
            if (planet.label === '1' && planet.period_days > 0 && planet.radius_rearth > 0 && planet.teff_k > 0) {
                exoplanetsData.push(planet);
            }
        }
        
        console.log(`${exoplanetsData.length} exoplanètes chargées`);
        
        // Démarrer le changement automatique
        startAutoChange();
        
    } catch (error) {
        console.error('Erreur lors du chargement du CSV:', error);
        // Fallback avec quelques exoplanètes de base
        exoplanetsData = [
            {
                label: "TOI-700 d",
                mission: "TESS",
                object_id: "TOI-700",
                period_days: 37.426,
                dur_hr: 10.3,
                depth_ppm: 1190,
                rprstar: 0.041,
                a_over_rstar: 0.163,
                radius_rearth: 1.07,
                insol_earth: 0.86,
                eq_temp_k: 268,
                teff_k: 3480,
                logg_cgs: 4.61,
                star_rad_rsun: 0.42,
                ra_deg: 66.458,
                dec_deg: -65.455,
                t_mag: 12.5
            }
        ];
    }
}

// Fonction pour démarrer le changement automatique
function startAutoChange() {
    // Nettoyer les intervals précédents s'ils existent
    if (autoChangeInterval) {
        clearInterval(autoChangeInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // Réinitialiser le compte à rebours
    timeRemaining = 30;
    updateCountdown();
    
    // Démarrer le compte à rebours
    countdownInterval = setInterval(() => {
        timeRemaining--;
        updateCountdown();
        
        if (timeRemaining <= 0) {
            timeRemaining = 30; // Réinitialiser pour le prochain cycle
        }
    }, 1000);
    
    // Changer d'exoplanète toutes les 30 secondes
    autoChangeInterval = setInterval(() => {
        loadRandomExoplanet();
    }, 30000);
}

// Fonction pour mettre à jour l'affichage du compte à rebours
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
        countdownElement.textContent = `${timeRemaining}s`;
        
        // Changer la couleur quand il reste peu de temps
        if (timeRemaining <= 5) {
            countdownElement.style.color = '#ff6b6b';
        } else if (timeRemaining <= 10) {
            countdownElement.style.color = '#ffaa44';
        } else {
            countdownElement.style.color = '#00d4ff';
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', async function() {
    canvas = document.getElementById('planetCanvas');
    
    // Initialiser le système 3D
    try {
        planetSystem3D = new PlanetSystem3D(canvas);
        document.getElementById('cameraMode').textContent = '3D Orbitale';
    } catch (error) {
        console.warn('WebGL non disponible, fallback vers Canvas 2D:', error);
        // Fallback vers l'ancien système 2D si WebGL n'est pas supporté
        init2DFallback();
    }
    
    // Redimensionner le canvas
    window.addEventListener('resize', () => {
        if (planetSystem3D) {
            planetSystem3D.resize();
        } else {
            resizeCanvas();
        }
    });
    
    // Charger les données CSV
    await loadCSVData();
    
    // Charger la première exoplanète
    if (exoplanetsData.length > 0) {
        loadExoplanet(currentPlanetIndex);
    }
    
    // Event listeners
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', loadRandomExoplanet);
    }
});

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    updateCenter();
}

function updateCenter() {
    centerX = canvas.width / (window.devicePixelRatio || 1) / 2;
    centerY = canvas.height / (window.devicePixelRatio || 1) / 2;
}

// Fonction pour charger une exoplanète aléatoire
function loadRandomExoplanet() {
    const randomIndex = Math.floor(Math.random() * exoplanetsData.length);
    loadExoplanet(randomIndex);
    
    // Réinitialiser le compte à rebours si c'est un changement manuel
    if (countdownInterval) {
        timeRemaining = 30;
        updateCountdown();
    }
}

// Fonction pour charger une exoplanète spécifique
function loadExoplanet(index) {
    if (index < 0 || index >= exoplanetsData.length) return;
    
    currentPlanetIndex = index;
    const planet = exoplanetsData[currentPlanetIndex];
    
    // Mettre à jour l'interface
    updatePlanetInfo(planet);
    
    // Mettre à jour le système 3D
    if (planetSystem3D) {
        planetSystem3D.setPlanet(planet);
    }
    
    // Ajouter un effet de transition
    document.body.classList.add('loading');
    setTimeout(() => {
        document.body.classList.remove('loading');
    }, 500);
}

// Fonction pour mettre à jour les informations de la planète
function updatePlanetInfo(planet) {
    // Informations principales
    document.getElementById('planetName').textContent = planet.object_id || 'Exoplanète confirmée';
    document.getElementById('missionBadge').textContent = planet.mission;
    
    // Informations détaillées
    document.getElementById('periodValue').textContent = formatPeriod(planet.period_days);
    document.getElementById('radiusValue').textContent = `${planet.radius_rearth.toFixed(2)} R⊕`;
    document.getElementById('tempValue').textContent = `${planet.eq_temp_k} K`;
    document.getElementById('distanceValue').textContent = `${planet.a_over_rstar.toFixed(3)} R*`;
    document.getElementById('transitValue').textContent = `${planet.dur_hr.toFixed(1)} h`;
    document.getElementById('depthValue').textContent = `${planet.depth_ppm.toLocaleString()} ppm`;
    
    // Caractéristiques de l'étoile
    document.getElementById('starTeff').textContent = `${planet.teff_k} K`;
    document.getElementById('starRadius').textContent = `${planet.star_rad_rsun.toFixed(2)} R☉`;
    document.getElementById('starLogg').textContent = `${planet.logg_cgs.toFixed(2)} cgs`;
    document.getElementById('starMag').textContent = planet.t_mag.toFixed(1);
    
    // Informations de l'étoile dans l'overlay
    document.getElementById('starName').textContent = planet.object_id;
    document.getElementById('starTemp').textContent = `${planet.teff_k} K`;
}

// Fonction pour formater la période
function formatPeriod(days) {
    if (days < 1) {
        return `${(days * 24).toFixed(1)} h`;
    } else if (days < 30) {
        return `${days.toFixed(2)} jours`;
    } else if (days < 365) {
        return `${(days / 30.44).toFixed(1)} mois`;
    } else {
        return `${(days / 365.25).toFixed(1)} ans`;
    }
}

// Fonction de fallback pour l'animation 2D
function init2DFallback() {
    console.log('Initialisation du fallback 2D');
    // Ici on pourrait réimplémenter l'ancien système 2D si nécessaire
    document.getElementById('cameraMode').textContent = '2D Fallback';
}

// Les fonctions d'animation 2D ont été remplacées par le système 3D WebGL

// Fonction utilitaire pour formater les nombres
function formatNumber(num, decimals = 2) {
    return num.toFixed(decimals).replace(/\.?0+$/, '');
}

// Gestion des erreurs
window.addEventListener('error', function(e) {
    console.error('Erreur JavaScript:', e.error);
});

// Fonction de nettoyage
window.addEventListener('beforeunload', function() {
    if (autoChangeInterval) {
        clearInterval(autoChangeInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});

function loadExample(type) {
    const form = document.getElementById('predictionForm');
    const data = examples[type];
    
    for (let key in data) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = data[key];
        }
    }
}

function generateRandomData() {
    const form = document.getElementById('predictionForm');
    
    const randomData = {
        mission: ["kepler", "k2", "tess"][Math.floor(Math.random() * 3)],
        t_mag: (Math.random() * 15 + 5).toFixed(1),
        period_days: (Math.random() * 100 + 0.5).toFixed(2),
        dur_hr: (Math.random() * 10 + 0.5).toFixed(1),
        depth_ppm: Math.floor(Math.random() * 50000 + 100),
        rprstar: (Math.random() * 0.3 + 0.01).toFixed(3),
        a_over_rstar: (Math.random() * 50 + 2).toFixed(1),
        radius_rearth: (Math.random() * 20 + 0.5).toFixed(1),
        insol_earth: (Math.random() * 10000 + 10).toFixed(1),
        eq_temp_k: Math.floor(Math.random() * 2500 + 200),
        teff_k: Math.floor(Math.random() * 5000 + 3000),
        logg_cgs: (Math.random() * 2 + 3.5).toFixed(2),
        star_rad_rsun: (Math.random() * 3 + 0.5).toFixed(2),
        ra_deg: (Math.random() * 360).toFixed(1),
        dec_deg: (Math.random() * 180 - 90).toFixed(1)
    };
    
    for (let key in randomData) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = randomData[key];
        }
    }
}