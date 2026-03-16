"""
Motor de búsqueda científica multi-estrategia.

Busca en PubMed (E-utilities) y Semantic Scholar para encontrar
evidencia relevante a la pregunta del entrenador. No hace una sola
query — usa múltiples estrategias y las combina.

APIs utilizadas:
- PubMed E-utilities (NCBI): https://www.ncbi.nlm.nih.gov/books/NBK25500/
- Semantic Scholar API: https://api.semanticscholar.org/
- Europe PMC: https://europepmc.org/RestfulWebService
"""
from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# Resultado de búsqueda
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class PaperResult:
    """Un paper encontrado en la búsqueda."""
    title: str
    authors: list[str]
    year: Optional[int]
    abstract: str
    journal: Optional[str]
    doi: Optional[str]
    pmid: Optional[str]
    citation_count: Optional[int] = None
    source: str = ""            # "pubmed" | "semantic_scholar" | "europepmc"
    relevance_score: float = 0.0  # 0-1, calculado por nosotros
    search_strategy: str = ""   # qué estrategia lo encontró
    open_access: bool = False


@dataclass
class SearchResult:
    """Resultado combinado de todas las estrategias de búsqueda."""
    query_original: str
    papers: list[PaperResult] = field(default_factory=list)
    strategies_used: list[str] = field(default_factory=list)
    total_found: int = 0


# ═══════════════════════════════════════════════════════════════════════════
# Diccionario de traducción: lenguaje del entrenador → términos científicos
# ═══════════════════════════════════════════════════════════════════════════

# Cada concepto del entrenador se mapea a sinónimos científicos que aparecen
# en títulos y abstracts de papers. El orden importa: el primero es el
# término más específico/preferido.

CONCEPT_TRANSLATIONS: dict[str, list[str]] = {
    # ── Umbrales ──
    "lt1": ["first lactate threshold", "aerobic threshold", "VT1", "lactate turn point"],
    "lt2": ["second lactate threshold", "MLSS", "OBLA", "anaerobic threshold", "lactate turn point 2"],
    "umbral": ["lactate threshold", "ventilatory threshold", "critical speed", "critical power"],
    "umbrales": ["lactate thresholds", "ventilatory thresholds", "exercise thresholds"],
    "mlss": ["maximal lactate steady state", "MLSS", "critical intensity"],
    "obla": ["onset of blood lactate accumulation", "OBLA", "4 mmol threshold"],

    # ── Capacidades fisiológicas ──
    "vo2max": ["VO2max", "maximal oxygen uptake", "aerobic capacity", "cardiorespiratory fitness"],
    "vo2": ["VO2max", "oxygen uptake", "oxygen consumption"],
    "vlamax": ["VLamax", "maximal lactate production rate", "glycolytic capacity", "glycolytic power"],
    "ftp": ["functional threshold power", "critical power", "power at MLSS"],
    "css": ["critical swim speed", "critical velocity", "CSS"],
    "economia": ["running economy", "movement economy", "oxygen cost", "energy cost of locomotion"],
    "economía": ["running economy", "movement economy", "oxygen cost"],
    "potencia": ["power output", "critical power", "power at threshold"],

    # ── Lactato ──
    "lactato": ["blood lactate", "lactate concentration", "lactate response", "lactate kinetics"],
    "curva de lactato": ["lactate curve", "lactate profile", "incremental lactate test"],
    "aclaramiento": ["lactate clearance", "lactate removal", "MCT transporters", "lactate shuttle"],
    "produccion de lactato": ["lactate production", "glycolytic flux", "glycolysis rate"],
    "baseline": ["resting lactate", "baseline lactate", "pre-exercise lactate"],

    # ── Entrenamiento / Periodización ──
    "base": ["aerobic base training", "low-intensity training", "zone 1 training"],
    "base aerobica": ["aerobic base", "submaximal training", "endurance foundation"],
    "polarizado": ["polarized training", "training intensity distribution", "80/20 training"],
    "umbral entrenamiento": ["threshold training", "tempo training", "sweetspot training"],
    "intervalos": ["interval training", "HIIT", "high-intensity interval training"],
    "volumen": ["training volume", "training load", "weekly mileage", "weekly training hours"],
    "intensidad": ["training intensity", "exercise intensity", "intensity distribution"],
    "periodizacion": ["periodization", "training periodization", "block periodization"],
    "mesociclo": ["mesocycle", "training block", "training phase"],
    "microciclo": ["microcycle", "weekly training plan", "training week"],
    "macrociclo": ["macrocycle", "annual plan", "season plan"],
    "taper": ["tapering", "pre-competition taper", "training reduction"],
    "pico de forma": ["peaking", "performance peaking", "competition preparation"],
    "bloque": ["block periodization", "concentrated training", "training block"],
    "carga": ["training load", "external load", "internal load", "training stress"],
    "descarga": ["recovery week", "deload", "reduced training", "unloading"],

    # ── Adaptación / Respuesta ──
    "adaptacion": ["training adaptation", "physiological adaptation", "exercise-induced adaptation"],
    "mejora": ["performance improvement", "training response", "adaptation"],
    "no mejora": ["training plateau", "non-response", "non-responder", "training stagnation"],
    "estancamiento": ["plateau", "stagnation", "non-response", "diminishing returns"],
    "sobreentrenamiento": ["overtraining", "overreaching", "unexplained underperformance syndrome"],
    "fatiga": ["fatigue", "accumulated fatigue", "central fatigue", "peripheral fatigue"],
    "supercompensacion": ["supercompensation", "fitness-fatigue model", "training response"],
    "desentrenamiento": ["detraining", "training cessation", "loss of adaptation"],
    "regresion": ["performance decline", "loss of fitness", "detraining effect"],

    # ── Recuperación ──
    "recuperacion": ["recovery", "post-exercise recovery", "training recovery"],
    "descanso": ["rest", "recovery", "sleep", "regeneration"],
    "sueño": ["sleep", "sleep quality", "sleep and performance"],
    "hrv": ["heart rate variability", "HRV", "autonomic nervous system", "parasympathetic"],

    # ── Disciplinas ──
    "running": ["running", "distance running", "endurance running"],
    "correr": ["running", "distance running", "endurance running"],
    "ciclismo": ["cycling", "road cycling", "cycling performance"],
    "bici": ["cycling", "road cycling", "cycling performance"],
    "natacion": ["swimming", "competitive swimming", "swimming performance"],
    "nadar": ["swimming", "competitive swimming", "swimming training"],
    "triatlon": ["triathlon", "multisport", "triathlon performance"],
    "ironman": ["ironman triathlon", "long-distance triathlon", "ultra-endurance"],
    "maraton": ["marathon", "marathon running", "marathon performance"],
    "media maraton": ["half marathon", "21km", "half marathon performance"],

    # ── Fisiología ──
    "mitocondrias": ["mitochondrial biogenesis", "mitochondrial density", "oxidative capacity"],
    "fibras musculares": ["muscle fiber type", "type I fibers", "type II fibers", "fiber composition"],
    "glucolisis": ["glycolysis", "glycolytic pathway", "anaerobic metabolism"],
    "oxidacion grasas": ["fat oxidation", "lipid metabolism", "fatty acid oxidation", "substrate utilization"],
    "frecuencia cardiaca": ["heart rate", "cardiac output", "heart rate response"],
    "fc maxima": ["maximal heart rate", "HRmax", "heart rate reserve"],
    "consumo de oxigeno": ["oxygen consumption", "VO2", "oxygen uptake"],

    # ── Testing ──
    "test": ["exercise testing", "incremental test", "graded exercise test"],
    "test de lactato": ["lactate test", "incremental lactate test", "step test protocol"],
    "test incremental": ["incremental exercise test", "graded exercise test", "ramp protocol"],
    "protocolo": ["test protocol", "exercise protocol", "testing methodology"],
    "fiabilidad": ["reliability", "test-retest reliability", "measurement error", "coefficient of variation"],

    # ── Composición corporal / Nutrición ──
    "peso": ["body mass", "body weight", "body composition"],
    "grasa": ["body fat", "adipose tissue", "body composition", "skinfold"],
    "nutricion": ["sports nutrition", "exercise nutrition", "fueling", "carbohydrate intake"],
    "hidratacion": ["hydration", "fluid intake", "dehydration", "sweat rate"],
    "carbohidratos": ["carbohydrate", "glycogen", "carbohydrate loading", "CHO intake"],

    # ── Ambiente ──
    "calor": ["heat", "heat acclimatization", "thermoregulation", "heat stress"],
    "altitud": ["altitude", "hypoxia", "altitude training", "live high train low"],
    "frio": ["cold", "cold exposure", "cold performance"],

    # ── Biomecánica ──
    "cadencia": ["cadence", "stride frequency", "pedaling rate", "stroke rate"],
    "zancada": ["stride length", "step length", "running kinematics"],
    "tecnica": ["technique", "biomechanics", "movement pattern", "kinematics"],

    # ── Lesiones / Salud ──
    "lesion": ["injury", "overuse injury", "injury prevention", "injury risk"],
    "dolor": ["pain", "muscle soreness", "DOMS", "delayed onset muscle soreness"],
    "riesgo": ["injury risk", "risk factors", "injury prevention"],
}

# ── MeSH terms para PubMed (más precisos que texto libre) ──
# Mapean conceptos a términos MeSH controlados del NCBI.
MESH_TERMS: dict[str, list[str]] = {
    "lt1": ["Anaerobic Threshold"],
    "lt2": ["Anaerobic Threshold"],
    "umbral": ["Anaerobic Threshold"],
    "vo2max": ["Oxygen Consumption"],
    "lactato": ["Lactic Acid/blood"],
    "running": ["Running"],
    "ciclismo": ["Bicycling"],
    "natacion": ["Swimming"],
    "intervalos": ["High-Intensity Interval Training"],
    "fatiga": ["Fatigue"],
    "recuperacion": ["Recovery of Function"],
    "periodizacion": ["Athletic Performance"],
    "sobreentrenamiento": ["Athletic Performance", "Overtraining"],
    "frecuencia cardiaca": ["Heart Rate"],
    "hrv": ["Heart Rate"],
    "calor": ["Hot Temperature", "Acclimatization"],
    "altitud": ["Altitude"],
    "lesion": ["Athletic Injuries"],
    "nutricion": ["Sports Nutritional Sciences"],
    "peso": ["Body Composition"],
    "economia": ["Biomechanical Phenomena"],
    "test": ["Exercise Test"],
}

# ── Autores clave por tema (para búsqueda por autor) ──
TOPIC_AUTHORS: dict[str, list[str]] = {
    "lactato": ["Faude O", "Billat V", "Beneke R", "Svedahl K"],
    "umbrales": ["Faude O", "Bishop D", "Jones AM", "Poole DC"],
    "vo2max": ["Bassett DR", "Howley ET", "Joyner MJ", "Coyle EF"],
    "vlamax": ["Olbrecht J", "Mader A", "Weber H"],
    "periodizacion": ["Issurin VB", "Mujika I", "Seiler S", "Stöggl T"],
    "polarizado": ["Seiler S", "Stöggl T", "Esteve-Lanao J", "Muñoz I"],
    "taper": ["Mujika I", "Pyne DB", "Bosquet L"],
    "economia": ["Barnes KR", "Saunders PU", "Fletcher JR"],
    "ironman": ["Hausswirth C", "Laursen PB", "Cejuela R"],
    "recuperacion": ["Mujika I", "Kellmann M", "Halson SL"],
    "sobreentrenamiento": ["Meeusen R", "Halson SL", "Kellmann M"],
    "hrv": ["Buchheit M", "Plews DJ", "Kiviniemi AM"],
    "calor": ["Périard JD", "Racinais S", "Lorenzo S"],
    "altitud": ["Millet GP", "Chapman RF", "Levine BD"],
    "nutricion": ["Jeukendrup AE", "Burke LM", "Thomas DT"],
    "intervalos": ["Buchheit M", "Laursen PB", "Billat V"],
}

# ── Journals de referencia en sport science ──
# Para filtrado de calidad — papers en estos journals tienen más peso.
TOP_JOURNALS: set[str] = {
    "medicine and science in sports and exercise",
    "journal of applied physiology",
    "sports medicine",
    "international journal of sports medicine",
    "european journal of applied physiology",
    "british journal of sports medicine",
    "journal of sports sciences",
    "journal of strength and conditioning research",
    "international journal of sports physiology and performance",
    "scandinavian journal of medicine and science in sports",
    "frontiers in physiology",
    "plos one",
    "journal of science and medicine in sport",
    "applied physiology nutrition and metabolism",
    "european journal of sport science",
}


# ═══════════════════════════════════════════════════════════════════════════
# Tokenización + traducción de preguntas
# ═══════════════════════════════════════════════════════════════════════════

_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "de", "del", "en", "con", "por",
    "para", "que", "es", "se", "su", "al", "no", "si", "como", "más", "ya",
    "pero", "muy", "mi", "me", "le", "lo", "este", "esta", "ese", "esa",
    "the", "and", "for", "that", "with", "this", "from", "are", "was", "has",
    "his", "her", "its", "our", "can", "will", "should", "would", "could",
    "have", "been", "does", "what", "why", "how", "when", "which",
    "pregunta", "quiero", "saber", "decir",
    "puedes", "explicar", "dime", "sobre", "cuanto", "cuanta", "cuantos",
    "deberia", "podria", "puede", "seria", "tienen", "hacen", "hago",
    "qué", "que", "cual", "cuales", "donde", "cuando", "quien",
    "hay", "ser", "estar", "tener", "hacer", "dar", "ver",
    "bien", "mal", "mucho", "poco", "todo", "todos", "nada", "algo",
    "entre", "otro", "otra", "otros", "cada", "mismo", "misma",
    "cómo", "interpreto", "bueno", "malo", "mejor", "peor",
    "horas", "dias", "días", "veces", "forma", "manera",
    "realmente", "bastante", "siempre", "nunca", "tambien", "también",
    "cuántas", "cuántos", "cuánto", "debería", "podría",
}

# ── Stemming básico español → forma canónica del diccionario ──
# Mapea variantes (conjugaciones, plurales, sinónimos coloquiales) a la
# clave exacta que aparece en CONCEPT_TRANSLATIONS.
_STEM_MAP: dict[str, str] = {
    # Verbos → sustantivo/concepto
    "mejorar": "mejora", "mejorando": "mejora", "mejore": "mejora", "mejoren": "mejora",
    "adaptar": "adaptacion", "adaptarse": "adaptacion", "adapta": "adaptacion", "adaptando": "adaptacion",
    "recuperar": "recuperacion", "recuperarse": "recuperacion", "recupera": "recuperacion",
    "entrenar": "entrenamiento", "entrenando": "entrenamiento", "entreno": "entrenamiento", "entrena": "entrenamiento",
    "descansar": "descanso", "descansando": "descanso", "descansa": "descanso",
    "correr": "running", "corriendo": "running", "corro": "running", "corre": "running",
    "nadar": "natacion", "nadando": "natacion", "nado": "natacion", "nada": "natacion",
    "pedalear": "ciclismo", "pedaleando": "ciclismo",
    "lesionar": "lesion", "lesionarse": "lesion", "lesionado": "lesion",
    "estancarse": "estancamiento", "estancado": "estancamiento", "estanca": "estancamiento",
    "fatigar": "fatiga", "fatigado": "fatiga", "fatigarse": "fatiga",
    "progresar": "mejora", "progresando": "mejora", "progreso": "mejora",

    # Plurales / variantes
    "intervalos": "intervalos", "intervalo": "intervalos",
    "umbrales": "umbrales", "umbral": "umbral",
    "sesiones": "entrenamiento", "sesion": "entrenamiento",
    "semanas": "microciclo", "semana": "microciclo",
    "meses": "mesociclo", "mes": "mesociclo",
    "temporada": "macrociclo", "temporadas": "macrociclo",
    "watts": "potencia", "vatios": "potencia",
    "ritmo": "economia", "ritmos": "economia",
    "pulsaciones": "frecuencia cardiaca",
    "corazon": "frecuencia cardiaca",
    "musculo": "fibras musculares", "musculos": "fibras musculares", "muscular": "fibras musculares",
    "grasa": "grasa", "grasas": "grasa",
    "proteina": "nutricion", "proteinas": "nutricion",
    "hierro": "nutricion", "vitamina": "nutricion", "vitaminas": "nutricion",
    "tendon": "lesion", "tendones": "lesion", "tendinitis": "lesion",
    "rodilla": "lesion", "tobillo": "lesion", "cadera": "lesion",

    # Conceptos coloquiales → término canónico
    "zona": "umbral", "zonas": "umbral",
    "fondo": "base", "aerobico": "base aerobica", "aerobica": "base aerobica",
    "anaerobico": "glucolisis", "anaerobica": "glucolisis",
    "velocidad": "economia", "rapido": "economia",
    "lento": "base", "despacio": "base",
    "subida": "mejora", "bajada": "regresion",
    "pico": "pico de forma", "forma": "pico de forma",
    "competicion": "pico de forma", "competir": "pico de forma", "carrera": "running",
    "rendimiento": "mejora",
    "resistencia": "base aerobica",
    "fuerza": "potencia",
    "sprint": "intervalos",
    "sprints": "intervalos",

    # Sustantivos directos
    "atleta": "atleta",
    "entrenador": "entrenamiento",
    "año": "adaptacion", "años": "adaptacion",
    "tiempo": "adaptacion", "plazo": "adaptacion",
    "largo": "adaptacion",
}

# ── Traducciones adicionales para conceptos que faltan ──
CONCEPT_TRANSLATIONS.update({
    "entrenamiento": ["endurance training", "exercise training", "training program", "training response"],
    "atleta": ["athlete", "endurance athlete", "trained athlete", "athletic performance"],
    "rendimiento": ["athletic performance", "endurance performance", "exercise performance"],
    "año": ["longitudinal training", "annual training", "long-term adaptation", "training periodization"],
    "tiempo": ["time course", "training duration", "adaptation timeline"],
    "progreso": ["training progression", "performance improvement", "fitness gains"],
})


def _stem(token: str) -> str:
    """Reduce un token español a su forma canónica del diccionario."""
    if token in _STEM_MAP:
        return _STEM_MAP[token]
    # Stemming ligero por sufijo: -ción, -miento, -ando, -endo, -ar, -er, -ir
    if token.endswith("cion") and len(token) > 5:
        # "adaptacion" ya está en el dict, dejarlo
        return token
    if token.endswith("miento") and len(token) > 7:
        base = token[:-6]
        # "entrenamiento" → "entrenamiento" (ya está)
        return token
    return token


def tokenize(text: str) -> list[str]:
    """Tokeniza texto eliminando stopwords, aplicando stemming y normalizando."""
    text = text.lower().strip()
    # Quitar signos de interrogación/exclamación
    text = text.replace("¿", "").replace("?", "").replace("¡", "").replace("!", "")
    # Mantener términos compuestos conocidos
    for compound in ("vo2max", "vo2", "lt1", "lt2", "hrv", "ftp", "css"):
        text = text.replace(compound, f" {compound} ")
    raw_tokens = re.findall(r"[a-záéíóúüñ0-9]+", text)
    tokens = [t for t in raw_tokens if t not in _STOPWORDS and len(t) > 1]
    # Aplicar stemming y deduplicar preservando orden
    stemmed = [_stem(t) for t in tokens]
    seen: set[str] = set()
    deduped: list[str] = []
    for t in stemmed:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped


def translate_to_scientific(tokens: list[str]) -> list[list[str]]:
    """Traduce tokens del entrenador a términos científicos.

    Devuelve una lista de grupos de sinónimos científicos, uno por token
    que tenga traducción. Los tokens sin traducción se mantienen como están.
    """
    result: list[list[str]] = []
    used = set()

    # Primero intentar bigrams (conceptos compuestos)
    for i in range(len(tokens) - 1):
        bigram = f"{tokens[i]} {tokens[i + 1]}"
        if bigram in CONCEPT_TRANSLATIONS:
            result.append(CONCEPT_TRANSLATIONS[bigram])
            used.add(i)
            used.add(i + 1)

    # Luego unigrams
    for i, token in enumerate(tokens):
        if i in used:
            continue
        if token in CONCEPT_TRANSLATIONS:
            result.append(CONCEPT_TRANSLATIONS[token])
        else:
            result.append([token])

    return result


def build_queries(question: str) -> list[dict]:
    """Construye múltiples queries de búsqueda desde la pregunta del entrenador.

    Devuelve una lista de dicts con:
    - query: str (la query para enviar a la API)
    - strategy: str (nombre de la estrategia)
    - source: str (pubmed | semantic_scholar)
    - mesh: bool (si usa MeSH terms)
    """
    tokens = tokenize(question)
    scientific_groups = translate_to_scientific(tokens)
    queries: list[dict] = []

    if not scientific_groups:
        return queries

    # Solo usar grupos que tienen traducción real (no el token suelto en español)
    translated_groups = [g for g in scientific_groups if g[0] in _all_scientific_terms() or len(g) > 1]
    # Si ningún token se tradujo, usar todos los grupos como fallback
    if not translated_groups:
        translated_groups = scientific_groups

    # ── Estrategia 1: Exacta — términos principales entre comillas ──
    primary_terms = [group[0] for group in translated_groups[:4]]
    exact_query = " AND ".join(f'"{t}"' for t in primary_terms if len(t) > 2)
    if exact_query:
        queries.append({
            "query": exact_query,
            "strategy": "exact",
            "source": "pubmed",
            "mesh": False,
        })
        queries.append({
            "query": " ".join(primary_terms),
            "strategy": "exact",
            "source": "semantic_scholar",
            "mesh": False,
        })

    # ── Estrategia 2: MeSH — términos controlados de PubMed ──
    mesh_parts = []
    for token in tokens:
        if token in MESH_TERMS:
            for mesh in MESH_TERMS[token]:
                mesh_parts.append(f"{mesh}[MeSH]")
    if mesh_parts:
        mesh_query = " AND ".join(mesh_parts[:3])
        queries.append({
            "query": mesh_query,
            "strategy": "mesh",
            "source": "pubmed",
            "mesh": True,
        })

    # ── Estrategia 3: Amplia — sinónimos alternativos ──
    alt_terms = []
    for group in translated_groups[:3]:
        if len(group) > 1:
            alt_terms.append(f'({" OR ".join(f"{t}" for t in group[:3])})')
        else:
            alt_terms.append(group[0])
    if alt_terms:
        broad_query = " AND ".join(alt_terms)
        queries.append({
            "query": broad_query,
            "strategy": "broad",
            "source": "pubmed",
            "mesh": False,
        })

    # ── Estrategia 4: Por autor — si el tema tiene expertos conocidos ──
    for token in tokens:
        if token in TOPIC_AUTHORS:
            authors = TOPIC_AUTHORS[token][:2]
            for author in authors:
                author_query = f"{author}[Author] AND {primary_terms[0] if primary_terms else token}"
                queries.append({
                    "query": author_query,
                    "strategy": "author",
                    "source": "pubmed",
                    "mesh": False,
                })
            break  # Solo un tema de autores

    # ── Estrategia 5: Fallback — si hay pocas queries, añadir una relajada ──
    if len(queries) <= 2 and primary_terms:
        # Semantic Scholar con solo los 2 mejores términos (más permisivo)
        relaxed = " ".join(primary_terms[:2])
        queries.append({
            "query": relaxed,
            "strategy": "relaxed",
            "source": "semantic_scholar",
            "mesh": False,
        })
        # PubMed con OR en vez de AND
        if len(primary_terms) >= 2:
            or_query = " OR ".join(f'"{t}"' for t in primary_terms[:3] if len(t) > 2)
            if or_query:
                queries.append({
                    "query": or_query,
                    "strategy": "relaxed",
                    "source": "pubmed",
                    "mesh": False,
                })

    return queries


def _all_scientific_terms() -> set[str]:
    """Devuelve un set con todos los términos científicos conocidos (para filtrar)."""
    terms: set[str] = set()
    for group in CONCEPT_TRANSLATIONS.values():
        terms.update(group)
    return terms


# ═══════════════════════════════════════════════════════════════════════════
# Clients de búsqueda
# ═══════════════════════════════════════════════════════════════════════════

_PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
_PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
_SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
_EUROPEPMC_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

# Rate limit: PubMed allows 3 requests/sec without API key, 10 with key.
# Semantic Scholar allows 100 requests/5min without key.


async def search_pubmed(query: str, max_results: int = 5) -> list[PaperResult]:
    """Busca en PubMed via E-utilities y devuelve papers con abstracts."""
    papers: list[PaperResult] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Paso 1: buscar IDs
            search_resp = await client.get(_PUBMED_SEARCH_URL, params={
                "db": "pubmed",
                "term": query,
                "retmax": max_results,
                "retmode": "json",
                "sort": "relevance",
            })
            search_resp.raise_for_status()
            search_data = search_resp.json()
            id_list = search_data.get("esearchresult", {}).get("idlist", [])

            if not id_list:
                return papers

            # Paso 2: fetch detalles
            fetch_resp = await client.get(_PUBMED_FETCH_URL, params={
                "db": "pubmed",
                "id": ",".join(id_list),
                "retmode": "xml",
                "rettype": "abstract",
            })
            fetch_resp.raise_for_status()
            papers = _parse_pubmed_xml(fetch_resp.text)

    except Exception as e:
        logger.warning(f"PubMed search failed for '{query}': {e}")

    return papers


def _parse_pubmed_xml(xml_text: str) -> list[PaperResult]:
    """Parsea XML de PubMed efetch a PaperResult."""
    import xml.etree.ElementTree as ET
    papers: list[PaperResult] = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return papers

    for article in root.findall(".//PubmedArticle"):
        medline = article.find(".//MedlineCitation")
        if medline is None:
            continue

        # Título
        title_el = medline.find(".//ArticleTitle")
        title = title_el.text if title_el is not None and title_el.text else ""

        # Abstract
        abstract_parts = []
        for abs_text in medline.findall(".//AbstractText"):
            if abs_text.text:
                label = abs_text.get("Label", "")
                prefix = f"{label}: " if label else ""
                abstract_parts.append(f"{prefix}{abs_text.text}")
        abstract = " ".join(abstract_parts)

        # Autores
        authors = []
        for author in medline.findall(".//Author"):
            last = author.find("LastName")
            init = author.find("Initials")
            if last is not None and last.text:
                name = last.text
                if init is not None and init.text:
                    name += f" {init.text}"
                authors.append(name)

        # Año
        year = None
        year_el = medline.find(".//PubDate/Year")
        if year_el is not None and year_el.text:
            try:
                year = int(year_el.text)
            except ValueError:
                pass

        # Journal
        journal_el = medline.find(".//Journal/Title")
        journal = journal_el.text if journal_el is not None else None

        # PMID
        pmid_el = medline.find(".//PMID")
        pmid = pmid_el.text if pmid_el is not None else None

        # DOI
        doi = None
        for eid in article.findall(".//ArticleId"):
            if eid.get("IdType") == "doi" and eid.text:
                doi = eid.text
                break

        if title:
            papers.append(PaperResult(
                title=title,
                authors=authors[:5],
                year=year,
                abstract=abstract,
                journal=journal,
                doi=doi,
                pmid=pmid,
                source="pubmed",
            ))

    return papers


async def search_semantic_scholar(query: str, max_results: int = 5) -> list[PaperResult]:
    """Busca en Semantic Scholar API."""
    papers: list[PaperResult] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(_SEMANTIC_SCHOLAR_URL, params={
                "query": query,
                "limit": max_results,
                "fields": "title,authors,year,abstract,journal,externalIds,citationCount,isOpenAccess",
            })
            resp.raise_for_status()
            data = resp.json()

            for paper in data.get("data", []):
                authors = [a.get("name", "") for a in paper.get("authors", [])[:5]]
                ext_ids = paper.get("externalIds") or {}

                papers.append(PaperResult(
                    title=paper.get("title", ""),
                    authors=authors,
                    year=paper.get("year"),
                    abstract=paper.get("abstract") or "",
                    journal=paper.get("journal", {}).get("name") if paper.get("journal") else None,
                    doi=ext_ids.get("DOI"),
                    pmid=ext_ids.get("PubMed"),
                    citation_count=paper.get("citationCount"),
                    source="semantic_scholar",
                    open_access=paper.get("isOpenAccess", False),
                ))

    except Exception as e:
        logger.warning(f"Semantic Scholar search failed for '{query}': {e}")

    return papers


async def search_europepmc(query: str, max_results: int = 5) -> list[PaperResult]:
    """Busca en Europe PMC (papers open access con full text)."""
    papers: list[PaperResult] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(_EUROPEPMC_URL, params={
                "query": query,
                "format": "json",
                "pageSize": max_results,
                "sort": "RELEVANCE",
            })
            resp.raise_for_status()
            data = resp.json()

            for result in data.get("resultList", {}).get("result", []):
                authors_str = result.get("authorString", "")
                authors = [a.strip() for a in authors_str.split(",")[:5]] if authors_str else []

                year = None
                if result.get("pubYear"):
                    try:
                        year = int(result["pubYear"])
                    except ValueError:
                        pass

                papers.append(PaperResult(
                    title=result.get("title", ""),
                    authors=authors,
                    year=year,
                    abstract=result.get("abstractText") or "",
                    journal=result.get("journalTitle"),
                    doi=result.get("doi"),
                    pmid=result.get("pmid"),
                    citation_count=result.get("citedByCount"),
                    source="europepmc",
                    open_access=result.get("isOpenAccess") == "Y",
                ))

    except Exception as e:
        logger.warning(f"Europe PMC search failed for '{query}': {e}")

    return papers


# ═══════════════════════════════════════════════════════════════════════════
# Scoring + deduplicación + ranking
# ═══════════════════════════════════════════════════════════════════════════

def _normalize_title(title: str) -> str:
    """Normaliza título para deduplicación."""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def _score_paper(paper: PaperResult, original_tokens: list[str]) -> float:
    """Puntúa la relevancia de un paper para la pregunta original.

    Factores:
    1. Coincidencia de términos en título (peso alto)
    2. Coincidencia de términos en abstract (peso medio)
    3. Journal de referencia (bonus)
    4. Citaciones (bonus logarítmico)
    5. Recencia (bonus para papers <10 años)
    6. Tiene abstract (requisito casi obligatorio)
    """
    score = 0.0
    title_lower = paper.title.lower()
    abstract_lower = paper.abstract.lower()

    # 1. Términos en título (0-40 pts)
    scientific_terms = []
    for token in original_tokens:
        if token in CONCEPT_TRANSLATIONS:
            scientific_terms.extend(CONCEPT_TRANSLATIONS[token])
        else:
            scientific_terms.append(token)

    title_hits = sum(1 for term in scientific_terms if term.lower() in title_lower)
    score += min(40, title_hits * 12)

    # 2. Términos en abstract (0-25 pts)
    if abstract_lower:
        abstract_hits = sum(1 for term in scientific_terms if term.lower() in abstract_lower)
        score += min(25, abstract_hits * 5)
    else:
        score -= 15  # Penalizar papers sin abstract

    # 3. Journal de referencia (0-15 pts)
    if paper.journal and paper.journal.lower() in TOP_JOURNALS:
        score += 15

    # 4. Citaciones (0-10 pts, logarítmico)
    if paper.citation_count and paper.citation_count > 0:
        import math
        score += min(10, math.log10(paper.citation_count + 1) * 4)

    # 5. Recencia (0-10 pts)
    if paper.year:
        age = 2026 - paper.year
        if age <= 5:
            score += 10
        elif age <= 10:
            score += 7
        elif age <= 20:
            score += 3

    return round(max(0, score), 1)


def deduplicate_and_rank(
    all_papers: list[PaperResult],
    original_tokens: list[str],
    max_results: int = 10,
) -> list[PaperResult]:
    """Deduplica por título, puntúa y devuelve los mejores."""
    seen_titles: set[str] = set()
    unique: list[PaperResult] = []

    for paper in all_papers:
        norm = _normalize_title(paper.title)
        if norm in seen_titles or not paper.title:
            continue
        seen_titles.add(norm)

        paper.relevance_score = _score_paper(paper, original_tokens)
        unique.append(paper)

    unique.sort(key=lambda p: p.relevance_score, reverse=True)
    return unique[:max_results]


# ═══════════════════════════════════════════════════════════════════════════
# Orquestador de búsqueda multi-estrategia
# ═══════════════════════════════════════════════════════════════════════════

async def search(
    question: str,
    max_results: int = 10,
    max_per_strategy: int = 5,
) -> SearchResult:
    """Búsqueda multi-estrategia: traduce la pregunta, busca en PubMed +
    Semantic Scholar + Europe PMC con múltiples estrategias, deduplica y
    rankea por relevancia.

    Args:
        question: Pregunta del entrenador (en español o inglés).
        max_results: Máximo de papers a devolver.
        max_per_strategy: Máximo de papers por estrategia individual.
    """
    tokens = tokenize(question)
    queries = build_queries(question)
    all_papers: list[PaperResult] = []
    strategies_used: list[str] = []

    import asyncio

    # Separar queries por source — limitamos PubMed a 3 queries max (rate limit 3/s)
    pubmed_queries = [q for q in queries if q["source"] == "pubmed"][:3]
    scholar_queries = [q for q in queries if q["source"] == "semantic_scholar"][:1]

    # Grupo 1: PubMed (secuencial con delay mínimo para evitar 429)
    for q in pubmed_queries:
        strategy_label = f"{q['strategy']}@pubmed"
        strategies_used.append(strategy_label)
        try:
            papers = await search_pubmed(q["query"], max_per_strategy)
            for p in papers:
                p.search_strategy = q["strategy"]
            all_papers.extend(papers)
        except Exception as e:
            logger.warning(f"PubMed {q['strategy']} failed: {e}")
        if len(pubmed_queries) > 1:
            await asyncio.sleep(0.35)  # PubMed rate limit: 3/s sin API key

    # Grupo 2: Semantic Scholar + Europe PMC (en paralelo, son sources distintas)
    parallel_tasks = []

    for q in scholar_queries:
        strategies_used.append(f"{q['strategy']}@semantic_scholar")
        parallel_tasks.append(_search_with_strategy(
            search_semantic_scholar(q["query"], max_per_strategy),
            q["strategy"],
        ))

    if tokens:
        primary = " ".join(
            CONCEPT_TRANSLATIONS[t][0] if t in CONCEPT_TRANSLATIONS else t
            for t in tokens[:3]
        )
        strategies_used.append("broad@europepmc")
        parallel_tasks.append(_search_with_strategy(
            search_europepmc(primary, max_per_strategy),
            "broad",
        ))

    if parallel_tasks:
        results = await asyncio.gather(*parallel_tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, list):
                all_papers.extend(result)

    ranked = deduplicate_and_rank(all_papers, tokens, max_results)

    return SearchResult(
        query_original=question,
        papers=ranked,
        strategies_used=strategies_used,
        total_found=len(all_papers),
    )


async def _search_with_strategy(
    coro,
    strategy: str,
) -> list[PaperResult]:
    """Wrapper que etiqueta cada paper con la estrategia que lo encontró."""
    papers = await coro
    for p in papers:
        p.search_strategy = strategy
    return papers


async def search_citations(doi: str, max_results: int = 5) -> list[PaperResult]:
    """Estrategia 6: Citation chain — busca papers que citan un paper dado.
    Útil para follow-up: encontrar trabajo reciente que se apoya en un hallazgo."""
    papers: list[PaperResult] = []

    if not doi:
        return papers

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}/citations",
                params={
                    "limit": max_results,
                    "fields": "title,authors,year,abstract,journal,externalIds,citationCount",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            for citation in data.get("data", []):
                citing = citation.get("citingPaper", {})
                if not citing.get("title"):
                    continue

                authors = [a.get("name", "") for a in citing.get("authors", [])[:5]]
                ext_ids = citing.get("externalIds") or {}

                papers.append(PaperResult(
                    title=citing.get("title", ""),
                    authors=authors,
                    year=citing.get("year"),
                    abstract=citing.get("abstract") or "",
                    journal=citing.get("journal", {}).get("name") if citing.get("journal") else None,
                    doi=ext_ids.get("DOI"),
                    pmid=ext_ids.get("PubMed"),
                    citation_count=citing.get("citationCount"),
                    source="semantic_scholar",
                    search_strategy="citation_chain",
                ))

    except Exception as e:
        logger.warning(f"Citation chain search failed for DOI {doi}: {e}")

    return papers
