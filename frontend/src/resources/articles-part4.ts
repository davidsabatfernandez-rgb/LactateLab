import { type ArticleContent } from "./articles";

export const ARTICLE_CONTENT_PART4: Record<string, ArticleContent> = {
  "lactate-testing-swimming": {
    title: "Test de lactato en natación: protocolo y zonas acuáticas",
    slug: "lactate-testing-swimming",
    readTime: "7 min",
    metaDescription:
      "Cómo adaptar el test de lactato a la piscina: protocolos específicos por estilo, zonas acuáticas, CSS vs umbral real y diferencias clave con running y ciclismo.",
    heroAlt: "Nadador en piscina con analizador de lactato al borde del vaso",
    sections: [
      {
        heading: "Por qué el test de lactato en natación es diferente",
        body: `<p>El test de lactato en natación comparte los principios fisiológicos del running o el ciclismo — medir la respuesta metabólica a intensidades crecientes — pero la ejecución difiere en aspectos fundamentales. El medio acuático impone restricciones que no existen en tierra: la posición horizontal cambia la distribución del flujo sanguíneo, la inmersión modifica la respuesta de la frecuencia cardíaca (el reflejo de inmersión reduce la FC entre 5 y 15 latidos respecto a tierra seca según Holmér, 1992), y la eficiencia técnica tiene un impacto desproporcionado en el coste energético.</p>
<p>Esto significa que <strong>las zonas de entrenamiento de natación no se pueden extrapolar de un test en bicicleta o corriendo</strong>. Un triatleta que usa sus zonas de carrera adaptadas al agua cometerá errores sistemáticos de intensidad. La natación necesita su propio test, su propia curva y sus propias zonas.</p>
<p>La buena noticia es que el protocolo es sencillo y se puede realizar en cualquier piscina de 25 o 50 metros con un analizador portátil. Lo que cambia es la logística: las muestras se toman en el borde del vaso durante pausas breves entre series, y la velocidad se controla por tiempos objetivo en lugar de por ritmo cardíaco.</p>`,
      },
      {
        heading: "Protocolo estándar: step test de 200 metros",
        body: `<p>El protocolo más validado para natación es el <strong>step test progresivo de 200 metros</strong> (Pyne et al., 2001; Mader, 1991). Consiste en 5-7 repeticiones de 200 metros a intensidades crecientes, con 30-45 segundos de pausa entre cada repetición para la toma de muestra de lactato en el lóbulo de la oreja (preferible al dedo en natación porque se seca más rápido).</p>
<ul>
<li><strong>Escalón 1:</strong> Ritmo muy cómodo, equivalente a un calentamiento largo (~70% del mejor tiempo en 200m)</li>
<li><strong>Escalón 2:</strong> Ritmo de nado continuo (~75%)</li>
<li><strong>Escalón 3:</strong> Ritmo de serie aeróbica (~80%)</li>
<li><strong>Escalón 4:</strong> Ritmo de umbral percibido (~85%)</li>
<li><strong>Escalón 5:</strong> Ritmo de competición en 400m (~90%)</li>
<li><strong>Escalón 6:</strong> Ritmo de competición en 200m (~95%)</li>
<li><strong>Escalón 7 (opcional):</strong> Máximo esfuerzo</li>
</ul>
<p>El incremento entre escalones debe ser <strong>constante en tiempo</strong> (por ejemplo, 5 segundos menos por 200m en cada paso). Esto es crucial: incrementos irregulares distorsionan la curva y complican la detección de umbrales.</p>
<p>La muestra se toma inmediatamente al finalizar cada 200m. El nadador apoya los antebrazos en el bordillo, se seca el lóbulo, se toma la muestra y se registra el tiempo exacto del 200m. Todo en menos de 45 segundos.</p>`,
      },
      {
        heading: "CSS vs umbral de lactato: no son lo mismo",
        body: `<p>El <strong>Critical Swim Speed (CSS)</strong> es una estimación de la velocidad sostenible basada en la diferencia de tiempos entre un 400m y un 200m máximos. Se calcula como:</p>
<p><em>CSS = (400 - 200) / (T400 - T200)</em></p>
<p>Es un test práctico y fácil de administrar, pero tiene limitaciones importantes cuando se compara con el umbral real de lactato:</p>
<ul>
<li><strong>Sobreestima el umbral en nadadores técnicos:</strong> Un nadador con buena economía a velocidades altas puede mantener un CSS por encima de su LT2 real durante un test corto, pero no durante un entrenamiento de 3000m.</li>
<li><strong>Subestima en nadadores de fondo:</strong> La contribución aeróbica en las pruebas de referencia (200m y 400m) es menor que en distancias largas, donde el nadador de fondo tiene ventaja metabólica.</li>
<li><strong>No distingue LT1 de LT2:</strong> El CSS da un solo número. El test de lactato da la curva completa con dos umbrales, lo que permite diferenciar entre trabajo de base aeróbica (bajo LT1) y trabajo de umbral (entre LT1 y LT2).</li>
</ul>
<p>En la práctica, el CSS se correlaciona con el LT2 en aproximadamente el 65-70% de los nadadores (Dekerle et al., 2005). En el 30% restante, la discrepancia puede superar los 5 segundos por 100m — suficiente para que el entrenamiento se haga en la zona equivocada.</p>`,
      },
      {
        heading: "Zonas por estilo: crol, espalda, braza y mariposa",
        body: `<p>Cada estilo de natación tiene un coste energético diferente y, por tanto, <strong>produce curvas de lactato distintas incluso en el mismo nadador</strong>. Un nadador polivalente que hace crol y mariposa necesita zonas separadas para cada estilo.</p>
<p>Las diferencias clave:</p>
<ul>
<li><strong>Crol:</strong> El estilo más económico. Los umbrales de lactato en crol suelen estar en velocidades un 10-15% más altas que en los demás estilos. Es el estilo de referencia para la mayoría de tests.</li>
<li><strong>Espalda:</strong> Similar al crol en eficiencia pero con menor velocidad absoluta. Los umbrales suelen estar 5-8% por debajo del crol en el mismo nadador.</li>
<li><strong>Braza:</strong> El estilo con mayor variabilidad individual. La eficiencia depende enormemente de la técnica de patada. Las diferencias de umbral entre braza y crol pueden variar entre 15% y 30%.</li>
<li><strong>Mariposa:</strong> Alto coste energético y fatiga neuromuscular acelerada. Los tests en mariposa requieren distancias más cortas por escalón (100m en lugar de 200m) porque mantener la técnica durante 200m a alta intensidad es difícil sin degradación técnica.</li>
</ul>
<p>Para triatletas, el test en crol es suficiente. Para nadadores de competición en varios estilos, el test debe repetirse en cada estilo relevante. Olbrecht recomienda un mínimo de dos tests por estilo por temporada.</p>`,
      },
      {
        heading: "Errores comunes en el test acuático",
        body: `<p>Los errores más frecuentes que invalidan un test de lactato en piscina:</p>
<ul>
<li><strong>Virajes inconsistentes:</strong> En piscina de 25m, un nadador que hace virajes abiertos en los primeros escalones y virajes con impulso fuerte en los últimos añade una variable que contamina la curva. El protocolo debe especificar el tipo de viraje y mantenerlo constante.</li>
<li><strong>Calentamiento excesivo:</strong> Un calentamiento largo con piezas de intensidad media eleva el lactato basal. El calentamiento debe ser corto (400-600m) y suave, con 3-5 minutos de descanso antes de empezar el test.</li>
<li><strong>Pull buoy o palas:</strong> Cualquier material auxiliar cambia el coste energético y anula la comparabilidad con tests anteriores. El test se hace sin material.</li>
<li><strong>Muestra tardía:</strong> El lactato en sangre capilar alcanza su pico 1-3 minutos después del esfuerzo. En las pausas de 30-45 segundos del protocolo, se captura el lactato del escalón recién completado. Si la pausa se alarga a 2 minutos, el lactato empieza a descender y el valor se contamina con aclaramiento.</li>
<li><strong>Piscina abarrotada:</strong> Compartir calle con otros nadadores obliga a cambios de ritmo, paradas y arranques que destruyen la linealidad del test.</li>
</ul>`,
      },
      {
        heading: "De la curva a las zonas acuáticas",
        body: `<p>Una vez obtenida la curva de lactato en piscina, la definición de zonas sigue los mismos principios que en tierra pero con valores de referencia ajustados:</p>
<ul>
<li><strong>Zona 1 (Recuperación):</strong> Por debajo de 1.5 mmol/L. Nado técnico, compensatorio. Ritmos muy por debajo del LT1.</li>
<li><strong>Zona 2 (Aeróbica / Base):</strong> Entre 1.5 y LT1 (~2.0 mmol/L). El grueso del volumen de entrenamiento en natación de fondo. Series largas (1500-3000m) a ritmo constante.</li>
<li><strong>Zona 3 (Tempo / Sub-umbral):</strong> Entre LT1 y LT2. Series de 400-800m con pausas cortas. Zona clave para nadadores de media distancia.</li>
<li><strong>Zona 4 (Umbral / LT2):</strong> Al nivel del LT2 (~4 mmol/L en la mayoría). Series de 200-400m con pausas de 15-30 segundos. Trabajo de tolerancia al lactato.</li>
<li><strong>Zona 5 (VO2max):</strong> Por encima del LT2. Series de 50-100m con pausas largas. Desarrollo de potencia aeróbica máxima.</li>
</ul>
<p>La diferencia más importante con las zonas de tierra es que <strong>en natación, la zona 2 ocupa una franja de velocidad más estrecha</strong>. La diferencia entre nadar a 1:45/100m y 1:40/100m puede ser la diferencia entre zona 2 y zona 3. Esta precisión es imposible sin un test de lactato — las fórmulas basadas en FC son especialmente imprecisas en el agua por el reflejo de inmersión.</p>`,
      },
      {
        heading: "Frecuencia de retesteo en natación",
        body: `<p>Las adaptaciones en natación tienen una particularidad: la mejora técnica puede cambiar la curva de lactato sin que haya cambio fisiológico real. Un nadador que mejora su eficiencia de brazada desplaza su curva a la derecha (más rápido al mismo lactato) aunque su VO2max no haya cambiado.</p>
<p>Por esto, <strong>la frecuencia de retesteo recomendada en natación es cada 6-8 semanas</strong> (Olbrecht, 2000), ligeramente más frecuente que en ciclismo o running. La razón es doble: los cambios técnicos son más rápidos y el rango de velocidades útiles para el entrenamiento es más estrecho, por lo que un error de 2 segundos/100m tiene más impacto.</p>
<p>Para triatletas, un test al inicio de cada fase de entrenamiento específico de natación es suficiente. Para nadadores de competición, Olbrecht recomienda un mínimo de 4 tests por temporada, espaciados estratégicamente antes de bloques de alta intensidad para ajustar ritmos.</p>`,
      },
    ],
    references: [
      "Pyne, D.B., Lee, H., & Swanwick, K.M. (2001). Monitoring the lactate threshold in world-ranked swimmers. Medicine & Science in Sports & Exercise, 33(2), 291-297.",
      "Holmér, I. (1992). Swimming physiology. Annals of Physiological Anthropology, 11(3), 269-276.",
      "Dekerle, J., et al. (2005). Validity and reliability of critical speed, critical stroke rate, and anaerobic capacity in relation to front crawl swimming performances. International Journal of Sports Medicine, 26(2), 94-98.",
      "Mader, A. (1991). Evaluation of the endurance performance of marathon runners and theoretical analysis of test results. The Journal of Sports Medicine and Physical Fitness, 31(1), 1-19.",
      "Olbrecht, J. (2000). The Science of Winning: Planning, Periodizing and Optimizing Swim Training. Luton: Swimshop.",
    ],
  },

  "energy-systems-balance": {
    title: "Capacidad aeróbica vs glucolítica: el balance que define tu rendimiento",
    slug: "energy-systems-balance",
    readTime: "10 min",
    metaDescription:
      "Entiende cómo interactúan VO2max y VLamax según Olbrecht. Qué revela tu curva de lactato sobre el equilibrio entre sistemas energéticos y cómo moverlo con entrenamiento.",
    heroAlt: "Diagrama de dos motores energéticos conectados por una curva de lactato",
    sections: [
      {
        heading: "El modelo de los dos motores",
        body: `<p>Jan Olbrecht, en <em>The Science of Winning</em>, propuso una forma elegante de entender el rendimiento de resistencia: <strong>dos motores que compiten por el mismo combustible</strong>. El motor aeróbico (definido por el VO2max) y el motor glucolítico (definido por la VLamax) determinan conjuntamente dónde se sitúan tus umbrales de lactato, cuánto tiempo puedes mantener cada intensidad, y cuál es tu perfil metabólico como atleta.</p>
<p>La analogía es directa: el VO2max es el techo de tu capacidad para consumir oxígeno y oxidar sustratos. La VLamax es la velocidad máxima a la que puedes producir lactato por vía glucolítica. <strong>Ambos sistemas usan glucógeno como combustible</strong>, y aquí está la clave del modelo: cuando la VLamax es alta, el sistema glucolítico consume glucógeno rápidamente, lo que limita la duración del esfuerzo aeróbico porque el sustrato se agota antes.</p>
<p>Esto explica una paradoja que muchos atletas experimentan: <strong>mejorar el VO2max no siempre mejora el rendimiento en resistencia</strong>. Si tu VLamax también es alta, el glucógeno se quema demasiado rápido desde abajo, y aunque tu techo aeróbico sea alto, no puedes operar cerca de él durante mucho tiempo. El equilibrio entre ambos motores es lo que determina tu rendimiento real.</p>`,
      },
      {
        heading: "Qué mide realmente la VLamax",
        body: `<p>La VLamax (velocidad máxima de producción de lactato) no es un número que se mide directamente en un test estándar de lactato. Se estima a partir de la forma de la curva y, en modelos más sofisticados, a partir de un sprint corto máximo combinado con un test incremental (Mader, 2003).</p>
<p>Lo que la VLamax representa fisiológicamente:</p>
<ul>
<li><strong>Actividad enzimática glucolítica:</strong> Especialmente la actividad de la fosfofructoquinasa (PFK) y la lactato deshidrogenasa (LDH) en las fibras musculares tipo IIa y IIx.</li>
<li><strong>Reclutamiento de fibras rápidas:</strong> A igualdad de composición muscular, un atleta que recluta más fibras rápidas a intensidades submáximas tiene una VLamax funcional más alta.</li>
<li><strong>Tasa de consumo de glucógeno:</strong> Una VLamax alta implica que se gasta más glucógeno por minuto a cualquier intensidad, lo que afecta directamente la autonomía en pruebas largas.</li>
</ul>
<p>En la curva de lactato, la VLamax se manifiesta como <strong>la pendiente de ascenso</strong> una vez superado el LT1. Una curva que sube suavemente indica VLamax baja; una que sube en vertical indica VLamax alta. Dos atletas con el mismo LT2 pero diferente VLamax tendrán perfiles de rendimiento muy distintos.</p>`,
      },
      {
        heading: "VO2max: el techo que pocos alcanzan",
        body: `<p>El VO2max define el máximo flujo de oxígeno que tu sistema cardiopulmonar puede entregar a los músculos activos y que estos pueden utilizar para producir ATP por vía oxidativa. Es, en términos prácticos, <strong>el tamaño de tu motor aeróbico</strong>.</p>
<p>Pero hay un matiz crítico que Olbrecht enfatiza: <strong>el VO2max es un techo, no un suelo</strong>. Lo que importa para el rendimiento de resistencia no es cuánto oxígeno puedes consumir como máximo, sino <strong>qué fracción de ese máximo puedes utilizar de forma sostenida</strong>. Esta fracción — la utilización fraccional — está determinada en gran parte por los umbrales de lactato.</p>
<p>Un atleta con VO2max de 70 ml/kg/min que solo puede utilizar el 75% sin acumular lactato (LT2 al 75% del VO2max) tiene el mismo rendimiento de resistencia que uno con VO2max de 60 que utiliza el 88%. Y la diferencia entre 75% y 88% está determinada casi enteramente por la relación VO2max/VLamax.</p>
<p>Por eso, <strong>mejorar los umbrales de lactato a menudo produce más mejora de rendimiento que mejorar el VO2max</strong>, especialmente en atletas con base de entrenamiento. El VO2max tiene un componente genético importante y un techo de mejora relativamente bajo (10-15% en la mayoría de atletas). Los umbrales pueden mejorar un 20-30% con entrenamiento estructurado.</p>`,
      },
      {
        heading: "Cómo la curva de lactato revela el equilibrio",
        body: `<p>La curva de lactato es el instrumento que hace visible la interacción entre VO2max y VLamax. Cada característica geométrica de la curva tiene una interpretación fisiológica:</p>
<ul>
<li><strong>Posición horizontal del LT1:</strong> Cuanto más a la derecha (mayor velocidad/potencia), mayor capacidad aeróbica. Un LT1 a alta intensidad indica que el sistema oxidativo domina hasta velocidades altas.</li>
<li><strong>Distancia entre LT1 y LT2:</strong> Una brecha amplia (LT1 muy por debajo de LT2) indica un desequilibrio: buena capacidad glucolítica pero aclaramiento de lactato insuficiente para mantener el equilibrio. Una brecha estrecha indica un sistema aeróbico dominante — típico de atletas de fondo entrenados.</li>
<li><strong>Pendiente después del LT2:</strong> La velocidad con que el lactato sube por encima de LT2 es un proxy directo de la VLamax. Subida vertical = alta VLamax (sprinter/explosivo). Subida gradual = baja VLamax (fondista eficiente).</li>
<li><strong>Lactato basal (primer punto):</strong> Un basal alto (>1.5 mmol) puede indicar fatiga residual, glucógeno deplecionado parcialmente, o estrés metabólico crónico. Importante para contextualizar el resto de la curva.</li>
</ul>
<p>Olbrecht llama a esto el <strong>"diagnóstico de la curva"</strong>: antes de prescribir entrenamiento, el coach lee la curva como un médico lee una analítica. El tratamiento (bloque de entrenamiento) depende del diagnóstico (perfil de la curva).</p>`,
      },
      {
        heading: "Cuatro perfiles metabólicos tipo",
        body: `<p>Combinando VO2max y VLamax, Olbrecht identifica cuatro perfiles metabólicos fundamentales que requieren estrategias de entrenamiento distintas:</p>
<ul>
<li><strong>Alto VO2max + Baja VLamax (El fondista nato):</strong> Gran motor aeróbico, poca producción glucolítica. Curva plana con LT2 a alta intensidad. Rendimiento excelente en pruebas largas. Punto débil: falta de cambio de ritmo y potencia final. Entrenamiento: incluir trabajo anaeróbico controlado (sprints cortos, trabajo de fuerza) para no perder fibras rápidas.</li>
<li><strong>Alto VO2max + Alta VLamax (El polivalente):</strong> Gran techo pero mucho consumo de glucógeno. Bueno en pruebas de 5-10 minutos pero se queda sin sustrato en pruebas largas. Curva con LT2 alto pero subida pronunciada. Entrenamiento: reducir VLamax con trabajo extensivo de base si el objetivo es resistencia; mantener si la prueba es corta.</li>
<li><strong>Bajo VO2max + Baja VLamax (El eficiente pero limitado):</strong> Motor pequeño pero bien regulado. Curva con LT2 a baja intensidad absoluta pero alto % del VO2max. Potencial de mejora alto si se expande el VO2max. Entrenamiento: priorizar VO2max con intervalos largos a alta intensidad (3-5 min al 90-95% VO2max).</li>
<li><strong>Bajo VO2max + Alta VLamax (El sprinter en resistencia):</strong> Perfil menos eficiente para resistencia. Curva empinada con LT2 bajo. Mucho lactato a intensidades moderadas. Entrenamiento: doble prioridad — expandir VO2max y reducir VLamax simultáneamente con bloques de base aeróbica prolongados.</li>
</ul>`,
      },
      {
        heading: "Cómo mover el equilibrio: palancas de entrenamiento",
        body: `<p>El entrenamiento mueve los dos cursores de forma independiente. Conocer la dirección de cada estímulo es fundamental para la prescripción:</p>
<p><strong>Para aumentar VO2max (subir el techo):</strong></p>
<ul>
<li>Intervalos largos al 90-100% VO2max (3-5 min con recuperación similar)</li>
<li>Tempo sostenido al 80-85% VO2max (20-40 min continuos)</li>
<li>Volumen total alto en zona 2 (adaptaciones periféricas: densidad mitocondrial, capilarización)</li>
</ul>
<p><strong>Para reducir VLamax (bajar la producción glucolítica):</strong></p>
<ul>
<li>Entrenamiento extensivo de base larga (>90 min en zona 1-2) — reduce la actividad enzimática glucolítica</li>
<li>Evitar sprints máximos y trabajo anaeróbico puro durante periodos de base</li>
<li>Entrenamiento en ayunas (con precaución) — fuerza al sistema a depender más de la oxidación de grasas</li>
<li>Cadencia alta en ciclismo (>95 rpm) — reduce el reclutamiento de fibras tipo II</li>
</ul>
<p><strong>Para aumentar VLamax (cuando interesa):</strong></p>
<ul>
<li>Sprints máximos cortos (10-30 segundos) con recuperación completa</li>
<li>Trabajo de fuerza máxima y potencia explosiva</li>
<li>Series anaeróbicas lácticas (30-90 segundos al máximo)</li>
</ul>
<p>La clave del modelo de Olbrecht es que <strong>el entrenamiento no puede mover ambos cursores en la misma dirección al mismo tiempo</strong>. Subir VO2max requiere intensidad alta; bajar VLamax requiere volumen extensivo bajo. Por eso la periodización por bloques — alternando fases con énfasis diferentes — es superior al entrenamiento mixto permanente.</p>`,
      },
      {
        heading: "Implicaciones por deporte y distancia",
        body: `<p>El equilibrio óptimo entre VO2max y VLamax depende del deporte y la distancia objetivo:</p>
<ul>
<li><strong>Maratón / Ironman:</strong> VLamax lo más baja posible. Cada milimol menos de producción glucolítica se traduce en minutos ahorrados de glucógeno. El VO2max importa, pero la utilización fraccional importa más.</li>
<li><strong>10K / Triatlón olímpico:</strong> Equilibrio moderado. Se necesita VLamax suficiente para cambios de ritmo y final rápido, pero no tanta que el glucógeno sea limitante.</li>
<li><strong>5K / 1500m:</strong> VLamax moderada-alta. La contribución anaeróbica es significativa (12-20% de la energía total). El VO2max es el factor dominante.</li>
<li><strong>800m / Sprint ciclista:</strong> VLamax alta. La capacidad glucolítica es determinante. El entrenamiento incluye trabajo anaeróbico específico.</li>
</ul>
<p>Este marco explica por qué un corredor de 5K no puede simplemente "añadir kilómetros" para preparar un maratón. Necesita cambiar su perfil metabólico — reducir VLamax — lo que requiere un bloque de entrenamiento específico de 8-12 semanas antes de que el entrenamiento de maratón convencional sea efectivo.</p>`,
      },
      {
        heading: "La curva de lactato como brújula de periodización",
        body: `<p>El modelo de Olbrecht convierte el test de lactato en una herramienta de periodización, no solo de diagnóstico. Cada test revela el estado actual del equilibrio VO2max/VLamax y dicta el siguiente bloque de entrenamiento:</p>
<ul>
<li>Si el LT1 está lejos del LT2 → falta capacidad aeróbica → bloque de base</li>
<li>Si la curva sube en vertical después del LT1 → VLamax alta → volumen extensivo</li>
<li>Si la curva es plana pero a baja intensidad → VO2max bajo → intervalos de potencia aeróbica</li>
<li>Si LT1 y LT2 están cerca pero a baja intensidad → motor pequeño pero eficiente → expandir VO2max</li>
</ul>
<p>Este enfoque elimina la conjetura de la planificación. En lugar de seguir un plan genérico de 16 semanas, cada bloque de 3-4 semanas se prescribe en función del estado fisiológico actual del atleta, medido objetivamente con la curva de lactato. Es la diferencia entre conducir con GPS y conducir con un mapa de 1990.</p>`,
      },
    ],
    references: [
      "Olbrecht, J. (2000). The Science of Winning: Planning, Periodizing and Optimizing Swim Training. Luton: Swimshop.",
      "Mader, A. (2003). Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. European Journal of Applied Physiology, 88(4-5), 317-338.",
      "Brooks, G.A. (2018). The Science and Translation of Lactate Shuttle Theory. Cell Metabolism, 27(4), 757-785.",
      "Billat, V.L. et al. (2003). The concept of maximal lactate steady state. Sports Medicine, 33(6), 407-426.",
      "Faude, O., Kindermann, W., & Meyer, T. (2009). Lactate threshold concepts: how valid are they? Sports Medicine, 39(6), 469-490.",
    ],
  },

  "lactate-curve-shifts": {
    title: "Cómo cambia tu curva de lactato con el entrenamiento",
    slug: "lactate-curve-shifts",
    readTime: "7 min",
    metaDescription:
      "Desplazamiento a la derecha vs hacia abajo: qué significa cada cambio en tu curva de lactato, cómo rastrearlo test a test y ejemplos reales de evolución con el entrenamiento.",
    heroAlt: "Tres curvas de lactato superpuestas mostrando evolución temporal",
    sections: [
      {
        heading: "Tu curva es una fotografía, no un retrato permanente",
        body: `<p>Cada test de lactato es una instantánea de tu estado metabólico en ese momento. La curva que obtienes hoy refleja el resultado acumulado de tu entrenamiento reciente, tu fatiga actual, tu nutrición, tu sueño y decenas de variables fisiológicas. <strong>Es una fotografía, no un retrato permanente.</strong></p>
<p>Lo verdaderamente valioso no es una curva aislada sino la <strong>comparación entre curvas sucesivas</strong>. Cuando superpones la curva de hoy con la de hace 8 semanas, los cambios te dicen exactamente qué efecto ha tenido tu entrenamiento — o si no ha tenido ninguno.</p>
<p>Los cambios en la curva siguen patrones predecibles que un entrenador experimentado puede interpretar. No son aleatorios: cada tipo de entrenamiento produce un tipo específico de desplazamiento. Conocer estos patrones convierte el test de lactato en una herramienta de seguimiento de alto valor.</p>`,
      },
      {
        heading: "Desplazamiento a la derecha: más rápido al mismo lactato",
        body: `<p>El desplazamiento a la derecha es el cambio más deseado para atletas de resistencia. Significa que <strong>puedes mantener una velocidad (o potencia) más alta al mismo nivel de lactato</strong>. La curva entera se mueve hacia la derecha: el LT1 aparece a mayor velocidad, el LT2 también, y toda la zona de trabajo aeróbico se expande.</p>
<p>Causas del desplazamiento a la derecha:</p>
<ul>
<li><strong>Aumento del VO2max:</strong> Un techo aeróbico más alto permite oxidar más lactato a cada intensidad. Es el efecto clásico de los intervalos de alta intensidad sostenidos durante 6-8 semanas.</li>
<li><strong>Mayor densidad mitocondrial:</strong> Más mitocondrias en las fibras musculares = mayor capacidad de oxidación de lactato in situ. Resultado del entrenamiento de volumen en zona 2 (Holloszy, 1967).</li>
<li><strong>Mejor capilarización:</strong> Más capilares por fibra muscular mejoran el transporte de oxígeno y el aclaramiento de lactato. Adaptación lenta (8-12 semanas) del entrenamiento aeróbico continuado.</li>
<li><strong>Mejora de la eficiencia mecánica:</strong> En natación especialmente, una mejora técnica desplaza la curva a la derecha sin cambio fisiológico. El atleta gasta menos energía a la misma velocidad.</li>
</ul>
<p>El desplazamiento a la derecha es el indicador por excelencia de que el entrenamiento de resistencia está funcionando. Si haces un bloque de base de 6 semanas y la curva no se ha movido, algo está fallando: la intensidad es demasiado alta (zona gris), el volumen es insuficiente, o la recuperación es inadecuada.</p>`,
      },
      {
        heading: "Desplazamiento hacia abajo: menos lactato a la misma velocidad",
        body: `<p>El desplazamiento hacia abajo es diferente del desplazamiento a la derecha, aunque a menudo ocurren juntos. Hacia abajo significa que <strong>a la misma velocidad produces menos lactato</strong> — la curva baja sin necesariamente moverse horizontalmente.</p>
<p>Este tipo de cambio refleja una <strong>reducción de la VLamax</strong>: tu sistema glucolítico produce menos lactato por unidad de tiempo. Las fibras musculares reclutan menos la vía anaeróbica, la actividad de las enzimas glucolíticas se reduce, y la proporción de energía proveniente de la oxidación de grasas aumenta.</p>
<p>Causas específicas del desplazamiento hacia abajo:</p>
<ul>
<li><strong>Entrenamiento de base extensivo prolongado:</strong> Semanas de volumen alto en zona 1-2 reducen la actividad de las enzimas glucolíticas (PFK, LDH) y aumentan la de las enzimas oxidativas (citrato sintasa, SDH).</li>
<li><strong>Reducción de trabajo anaeróbico:</strong> Eliminar sprints y trabajo láctico durante un bloque de base permite que la maquinaria glucolítica se "desregule" parcialmente.</li>
<li><strong>Adaptaciones en el metabolismo de grasas:</strong> Mayor capacidad de oxidación de ácidos grasos a intensidades moderadas = menor dependencia de glucógeno = menor producción de lactato.</li>
</ul>
<p>El desplazamiento hacia abajo es particularmente importante para maratonianos y triatletas de larga distancia, donde la economía de sustrato (conservar glucógeno) es determinante. Un descenso de 0.5 mmol/L al ritmo de maratón puede significar 15-20 minutos menos de fatiga glucogénica en la segunda mitad de la carrera.</p>`,
      },
      {
        heading: "Desplazamiento a la izquierda: la señal de alarma",
        body: `<p>Si la curva se desplaza a la izquierda — los umbrales aparecen a menor velocidad — es una señal de que algo no va bien. Las causas más comunes:</p>
<ul>
<li><strong>Sobreentrenamiento / Fatiga acumulada:</strong> El sistema oxidativo no puede funcionar a plena capacidad porque los mecanismos de reparación y adaptación están sobrecargados. El lactato sube antes porque el aclaramiento está comprometido (Lehmann et al., 1993).</li>
<li><strong>Desentrenamiento:</strong> Un periodo prolongado sin entrenamiento (>3-4 semanas) reduce la densidad mitocondrial y la capilarización. Las adaptaciones aeróbicas se pierden más rápido que las de fuerza.</li>
<li><strong>Enfermedad o infección subclínica:</strong> Incluso una infección leve activa cascadas inflamatorias que aumentan el consumo de glucógeno y comprometen la función mitocondrial.</li>
<li><strong>Nutrición inadecuada:</strong> Depleción crónica de glucógeno (dietas muy bajas en carbohidratos sin adaptación) puede elevar el lactato basal y desplazar la curva.</li>
</ul>
<p><strong>Importante:</strong> un desplazamiento a la izquierda de un solo test puede ser simplemente fatiga aguda (entrenamiento duro el día anterior). Solo es significativo si se confirma en un segundo test realizado en condiciones de descanso adecuado. Por eso es fundamental estandarizar las condiciones pre-test: 24-48h sin entrenamiento intenso, alimentación normal, sueño adecuado.</p>`,
      },
      {
        heading: "Cambio de forma sin cambio de posición",
        body: `<p>A veces la curva no se desplaza horizontalmente ni verticalmente, pero <strong>cambia de forma</strong>. Este es el tipo de cambio más sutil pero potencialmente más informativo:</p>
<ul>
<li><strong>Aplanamiento de la parte baja:</strong> La zona entre reposo y LT1 se vuelve más plana (menos incremento de lactato). Indica mejora de la capacidad aeróbica de base. El sistema maneja las intensidades bajas con más holgura.</li>
<li><strong>Cambio de pendiente por encima de LT2:</strong> Si la parte alta de la curva se vuelve menos empinada, la VLamax ha descendido. Si se vuelve más empinada, la VLamax ha aumentado (posible si se ha incorporado trabajo de sprint).</li>
<li><strong>Separación o acercamiento de LT1 y LT2:</strong> Un acercamiento (LT1 sube, LT2 se mantiene) indica mejora del aclaramiento de lactato. Una separación (LT1 baja, LT2 se mantiene) puede indicar fatiga del sistema de aclaramiento o pérdida de capacidad oxidativa basal.</li>
</ul>
<p>Estos cambios de forma son la razón por la que <strong>mirar solo los números de LT1 y LT2 es insuficiente</strong>. Dos tests pueden dar el mismo LT2 a 4:15/km pero con curvas de forma completamente diferente — lo que implica estados fisiológicos distintos y necesidades de entrenamiento distintas.</p>`,
      },
      {
        heading: "Cómo comparar tests correctamente",
        body: `<p>Para que la comparación entre curvas sea válida, las condiciones del test deben ser lo más similares posible:</p>
<ul>
<li><strong>Mismo protocolo:</strong> Los mismos escalones de velocidad/potencia, la misma duración por escalón, la misma recuperación entre escalones. Cambiar el protocolo invalida la comparación directa.</li>
<li><strong>Mismo estado de fatiga:</strong> Al menos 24-48h sin entrenamiento intenso. Idealmente, la misma posición en la semana (por ejemplo, siempre después del día de descanso).</li>
<li><strong>Misma nutrición pre-test:</strong> Desayuno similar, hidratación adecuada, sin ayuno ni sobrecarga de carbohidratos inusual.</li>
<li><strong>Mismo equipo de medición:</strong> Los analizadores portátiles pueden variar ±0.3 mmol entre marcas. Usar siempre el mismo modelo con tiras del mismo lote reduce el ruido.</li>
<li><strong>Mismas condiciones ambientales:</strong> Calor, humedad y altitud afectan la respuesta de lactato. Un test en agosto a 35°C no es comparable con uno en enero a 10°C.</li>
</ul>
<p>Cuando las condiciones son estandarizadas, un cambio de ≥0.3 mmol/L al mismo ritmo o de ≥3-5 seg/km al mismo lactato se considera significativo (más allá del error de medición). Cambios menores pueden ser ruido.</p>`,
      },
      {
        heading: "Línea temporal: cuándo esperar cada tipo de cambio",
        body: `<p>Las adaptaciones fisiológicas no ocurren todas al mismo ritmo. Saber cuándo esperar cada tipo de cambio evita la frustración de retestear demasiado pronto:</p>
<ul>
<li><strong>2-3 semanas:</strong> Mejoras neuronales y de reclutamiento. No cambian la curva de lactato significativamente, pero sí la percepción de esfuerzo.</li>
<li><strong>4-6 semanas:</strong> Primeras adaptaciones enzimáticas. Aumento de actividad de citrato sintasa y otras enzimas oxidativas. Se puede detectar un inicio de desplazamiento a la derecha, especialmente en atletas menos entrenados.</li>
<li><strong>6-8 semanas:</strong> Cambios significativos en la curva. Densidad mitocondrial aumentada, capilarización mejorada. Este es el momento óptimo para retestear después de un bloque de entrenamiento bien diseñado.</li>
<li><strong>8-12 semanas:</strong> Cambios en composición de fibras (shift de IIx a IIa) y en la capacidad de oxidación de grasas. Desplazamientos hacia abajo de la curva (VLamax reducida) suelen requerir este plazo.</li>
<li><strong>12-16+ semanas:</strong> Adaptaciones cardíacas (aumento del volumen sistólico) y cambios de VO2max verdadero. El techo aeróbico real tarda más en subir que los umbrales.</li>
</ul>
<p>Por esto Olbrecht recomienda bloques de 3-4 semanas con retesteo al final: da tiempo suficiente para que las enzimas cambien, pero no tanto como para desperdiciar semanas en un estímulo que ya no produce adaptación.</p>`,
      },
    ],
    references: [
      "Holloszy, J.O. (1967). Biochemical adaptations in muscle: effects of exercise on mitochondrial oxygen uptake and respiratory enzyme activity in skeletal muscle. Journal of Biological Chemistry, 242(9), 2278-2282.",
      "Lehmann, M., Foster, C., & Keul, J. (1993). Overtraining in endurance athletes: a brief review. Medicine & Science in Sports & Exercise, 25(7), 854-862.",
      "Faude, O., Kindermann, W., & Meyer, T. (2009). Lactate threshold concepts: how valid are they? Sports Medicine, 39(6), 469-490.",
      "Olbrecht, J. (2000). The Science of Winning: Planning, Periodizing and Optimizing Swim Training. Luton: Swimshop.",
      "Jones, A.M. & Carter, H. (2000). The effect of endurance training on parameters of aerobic fitness. Sports Medicine, 29(6), 373-386.",
    ],
  },

  "vlamax-training-guide": {
    title: "Guía práctica para manipular tu VLamax con entrenamiento",
    slug: "vlamax-training-guide",
    readTime: "8 min",
    metaDescription:
      "Cuándo quieres una VLamax alta vs baja, entrenamientos específicos para cada dirección, plazos esperados y consideraciones por deporte. Guía práctica basada en Olbrecht.",
    heroAlt: "Espectro de VLamax con deportes posicionados desde fondista hasta sprinter",
    sections: [
      {
        heading: "VLamax: el cursor que casi nadie entrena a propósito",
        body: `<p>La mayoría de atletas entrenan su VO2max conscientemente: hacen intervalos, series largas, tempo. Pero la VLamax — la otra mitad de la ecuación metabólica — se mueve como efecto secundario del entrenamiento, no como objetivo. <strong>Muy pocos atletas o entrenadores manipulan la VLamax de forma deliberada.</strong></p>
<p>Esto es un error importante porque, según el modelo de Olbrecht, la VLamax tiene un impacto igual o mayor que el VO2max en el rendimiento de resistencia. Reducir la VLamax en un atleta de Ironman puede producir más mejora de rendimiento que aumentar el VO2max, especialmente en atletas ya bien entrenados donde el VO2max está cerca de su techo genético.</p>
<p>La razón por la que la VLamax se ignora es que no aparece en los relojes deportivos, no tiene un "test de VLamax" sencillo como el test FTP para ciclismo, y su efecto es indirecto: no hace que vayas más rápido mañana, pero determina cuánto puedes mantener esa velocidad.</p>`,
      },
      {
        heading: "Cuándo quieres una VLamax baja",
        body: `<p>Una VLamax baja es deseable cuando el factor limitante del rendimiento es la <strong>duración</strong> y la <strong>economía de sustrato</strong>:</p>
<ul>
<li><strong>Maratón:</strong> El rendimiento en maratón está limitado por la disponibilidad de glucógeno. Una VLamax baja significa menos consumo glucolítico a cada paso, lo que retrasa la depleción y la temida "pájara" del km 30-35.</li>
<li><strong>Ironman / medio Ironman:</strong> Con 4-9 horas de esfuerzo, cada milimol menos de producción de lactato se traduce en gramos de glucógeno conservados. La VLamax baja permite una mayor proporción de oxidación de grasas a ritmo de competición.</li>
<li><strong>Ciclismo de larga distancia:</strong> Etapas de 4-6 horas donde la gestión de energía es crítica. Ciclistas con VLamax baja pueden mantener ritmos altos sin necesidad de ingerir tantos carbohidratos por hora.</li>
<li><strong>Natación de fondo (5K, 10K aguas abiertas):</strong> Similar al maratón, la economía de sustrato determina quién puede mantener el ritmo en la segunda mitad.</li>
</ul>
<p>El indicador en la curva de lactato: una VLamax baja produce una curva que sube <strong>gradualmente</strong> por encima del LT1, sin la subida vertical que caracteriza a los atletas explosivos. El LT2 suele estar a un % alto del VO2max (>82-85%).</p>`,
      },
      {
        heading: "Cuándo quieres una VLamax alta",
        body: `<p>No siempre quieres una VLamax baja. Para ciertos deportes y distancias, la capacidad glucolítica es una ventaja:</p>
<ul>
<li><strong>800m / 1500m:</strong> La contribución anaeróbica es del 30-60%. Una VLamax alta permite producir más energía glucolítica durante el sprint final y las fases de cambio de ritmo.</li>
<li><strong>Sprint en ciclismo pista:</strong> Los esfuerzos de 30-60 segundos dependen casi enteramente de la capacidad glucolítica. Una VLamax baja sería contraproducente.</li>
<li><strong>Natación 50-100m:</strong> Esfuerzos donde la vía anaeróbica aporta la mayor parte de la energía. Reducir VLamax limitaría la velocidad punta.</li>
<li><strong>Deportes de equipo con acciones explosivas:</strong> Fútbol, rugby, waterpolo — necesitan capacidad de sprint repetido donde la vía glucolítica es esencial.</li>
</ul>
<p>Pero hay un matiz importante incluso aquí: <strong>la VLamax no necesita ser máxima, sino óptima para la distancia</strong>. Un corredor de 1500m no necesita la VLamax de un sprinter de 100m. Demasiada VLamax penaliza incluso en 1500m porque el consumo de glucógeno es excesivo para una prueba de 3.5-4 minutos.</p>`,
      },
      {
        heading: "Entrenamientos para reducir VLamax",
        body: `<p>Reducir la VLamax requiere entrenamientos que <strong>down-regulen la maquinaria glucolítica</strong> y favorezcan la oxidación. Los estímulos más efectivos:</p>
<ul>
<li><strong>Entrenamiento de base extensivo (>90 min en zona 1-2):</strong> El estímulo principal. Sesiones largas a baja intensidad con predominancia de oxidación de grasas. La actividad sostenida sin activación glucolítica significativa reduce la expresión de enzimas glucolíticas con el tiempo.</li>
<li><strong>Cadencia alta en ciclismo (>95 rpm):</strong> Reducir la fuerza por pedalada disminuye el reclutamiento de fibras tipo II, que son las principales productoras de lactato. Los atletas que pedalean a 80 rpm reclutan más fibras rápidas que los que pedalean a 100 rpm a la misma potencia.</li>
<li><strong>Entrenamiento en ayunas (con precaución):</strong> Sesiones matinales de 60-90 min en zona 2 sin desayuno fuerzan al sistema a utilizar más grasas. Esto up-regula las enzimas de la beta-oxidación y down-regula parcialmente las glucolíticas. <strong>Precaución:</strong> solo para atletas experimentados, con intensidad estrictamente baja, e hidratación adecuada.</li>
<li><strong>Evitar sprints y trabajo láctico:</strong> Durante un bloque de reducción de VLamax (4-8 semanas), eliminar completamente los sprints máximos, los intervalos cortos de alta intensidad y el trabajo de fuerza explosiva. Cada sprint es un estímulo que mantiene la maquinaria glucolítica activa.</li>
<li><strong>Entrenamiento polarizado con umbral inferior al LT1:</strong> El 80% del volumen debe estar por debajo del LT1. El 20% puede ser en LT2, pero nunca por encima. La zona entre LT1 y LT2 (la "zona gris") es el peor lugar para reducir VLamax porque activa parcialmente el sistema glucolítico sin los beneficios del trabajo de alta intensidad.</li>
</ul>`,
      },
      {
        heading: "Entrenamientos para aumentar VLamax",
        body: `<p>Aumentar la VLamax requiere estímulos que <strong>up-regulen la capacidad glucolítica máxima</strong>:</p>
<ul>
<li><strong>Sprints máximos cortos (10-30 segundos):</strong> Esfuerzos all-out con recuperación completa (3-5 minutos entre repeticiones). El objetivo es activar al máximo las fibras tipo II y la vía glucolítica. No más de 6-8 repeticiones por sesión.</li>
<li><strong>Series anaeróbicas lácticas (30-90 segundos):</strong> Esfuerzos al 90-100% de velocidad máxima con recuperación incompleta (1:2 o 1:3). Generan acumulación máxima de lactato y estimulan la expresión de enzimas glucolíticas. Ejemplo: 6×60" al máximo con 2' recuperación.</li>
<li><strong>Entrenamiento de fuerza máxima:</strong> Sentadillas, prensa, peso muerto a cargas altas (>85% 1RM) con pocas repeticiones (3-5). El reclutamiento de fibras tipo II en fuerza máxima es el estímulo más potente para mantener (o aumentar) la masa de fibras rápidas.</li>
<li><strong>Trabajo de potencia explosiva:</strong> Saltos pliométricos, kettlebell swings, cuestas cortas al sprint. Combina reclutamiento de fibras rápidas con velocidad de contracción alta.</li>
<li><strong>Cadencia baja en ciclismo (50-60 rpm) a alta potencia:</strong> Fuerza aplicada por pedalada alta = mayor reclutamiento de fibras tipo II. Series de 3-5 min a potencia de umbral con cadencia de 50 rpm.</li>
</ul>
<p><strong>Nota importante:</strong> aumentar la VLamax es más rápido que reducirla. Las enzimas glucolíticas responden en 2-4 semanas a estímulos de sprint. Reducir la VLamax puede requerir 6-12 semanas de entrenamiento extensivo consistente.</p>`,
      },
      {
        heading: "Plazos esperados de cambio",
        body: `<p>La VLamax no cambia de un día para otro. Los plazos típicos según la dirección del cambio y el nivel del atleta:</p>
<ul>
<li><strong>Reducción de VLamax en atleta recreativo:</strong> 4-6 semanas de entrenamiento de base consistente pueden producir un descenso detectable en la pendiente de la curva de lactato. El cambio es más rápido en atletas no entrenados porque parten de una VLamax relativamente alta.</li>
<li><strong>Reducción de VLamax en atleta entrenado:</strong> 6-12 semanas. Un atleta con años de entrenamiento tiene una VLamax ya parcialmente optimizada. Reducciones adicionales requieren bloques de base más largos y eliminación rigurosa de estímulos glucolíticos.</li>
<li><strong>Aumento de VLamax en atleta de fondo:</strong> 2-4 semanas con sprints regulares (3x/semana). La maquinaria glucolítica responde rápidamente a la demanda. Esto puede ser un problema: un fondista que incorpora sprints "para variar" puede subir su VLamax involuntariamente y perjudicar su rendimiento en distancia.</li>
<li><strong>Mantenimiento:</strong> Para mantener una VLamax baja, es necesario limitar los estímulos glucolíticos de forma permanente. Si un maratoniano hace una fase de 4 semanas de trabajo de velocidad, puede subir su VLamax lo suficiente como para necesitar otras 6-8 semanas de base para volver al nivel anterior.</li>
</ul>
<p>Esto tiene implicaciones directas para la periodización: <strong>los bloques de velocidad/sprint no deben colocarse demasiado cerca de la competición objetivo en atletas de larga distancia</strong> porque la VLamax sube rápido pero baja lento.</p>`,
      },
      {
        heading: "Consideraciones por deporte",
        body: `<p>El objetivo de VLamax óptimo varía significativamente entre deportes:</p>
<ul>
<li><strong>Running — Maratón:</strong> VLamax lo más baja posible. Objetivo: <0.35 mmol/L/s. El entrenamiento de base extensivo (120-180 min) y la cadencia alta (>180 ppm) son prioritarios. Los "strides" al final de las tiradas largas son suficiente estímulo neuromuscular sin subir VLamax.</li>
<li><strong>Running — 10K:</strong> VLamax moderada-baja (~0.35-0.45 mmol/L/s). Se necesita cierta capacidad de cambio de ritmo para la carrera. Un bloque de base seguido de un bloque corto de tempo/velocidad es la secuencia típica.</li>
<li><strong>Ciclismo — Contrarreloj/Ironman:</strong> VLamax baja. Las sesiones de base larga (3-5h) en zona 2 son el pilar. La cadencia alta (95-105 rpm) complementa. Evitar entrenamientos de fuerza con cargas muy altas en período de base.</li>
<li><strong>Ciclismo — Pista/Sprint:</strong> VLamax alta. El programa es esencialmente de fuerza + sprints. El entrenamiento aeróbico se minimiza al mantenimiento.</li>
<li><strong>Natación — 1500m/Aguas abiertas:</strong> VLamax moderada-baja. Series largas de base (3000-5000m continuos) con técnica son el pilar. Importante: la técnica de natación tiene un efecto desproporcionado en la economía, así que mejorar la técnica es a veces más efectivo que más volumen.</li>
<li><strong>Triatlón:</strong> VLamax baja en ciclismo y running; en natación puede ser ligeramente más alta por la duración relativa más corta del segmento. La clave es no contaminar la VLamax baja de running con trabajo de alta intensidad en ciclismo o viceversa — por eso los bloques disciplinarios son importantes.</li>
</ul>`,
      },
      {
        heading: "Cómo saber si tu VLamax está cambiando",
        body: `<p>Sin un test formal de VLamax (que requiere un sprint máximo + test incremental + modelado matemático), puedes usar <strong>proxies</strong> en tu test de lactato estándar:</p>
<ul>
<li><strong>Ratio LT1/LT2:</strong> Si la velocidad de tu LT1 dividida por la velocidad de tu LT2 es >0.87, tu VLamax es probablemente baja. Si es <0.79, es alta. Este ratio se correlaciona inversamente con la VLamax porque una VLamax baja acerca los dos umbrales.</li>
<li><strong>Pendiente de la curva entre LT1 y LT2:</strong> Calcula (lactato_LT2 - lactato_LT1) / (velocidad_LT2 - velocidad_LT1). Si este valor disminuye entre tests, tu VLamax está bajando.</li>
<li><strong>Lactato a máxima intensidad:</strong> El lactato pico al final del test es un proxy directo de VLamax. Un descenso del lactato pico entre tests (con misma velocidad máxima) indica VLamax reducida.</li>
<li><strong>Rendimiento en test de sprint:</strong> Si tus tiempos en 200m o 400m al máximo empeoran sin cambio en resistencia, es probable que la VLamax haya bajado (menos potencia anaeróbica disponible).</li>
</ul>
<p>PeakAerobic calcula estos proxies automáticamente y los presenta como parte del perfil metabólico del atleta, permitiendo al entrenador rastrear la evolución de la VLamax test a test sin necesidad de protocolos adicionales.</p>`,
      },
    ],
    references: [
      "Olbrecht, J. (2000). The Science of Winning: Planning, Periodizing and Optimizing Swim Training. Luton: Swimshop.",
      "Mader, A. (2003). Glycolysis and oxidative phosphorylation as a function of cytoplasmic phosphorylation state and power output of the muscle cell. European Journal of Applied Physiology, 88(4-5), 317-338.",
      "Seiler, S. (2010). What is best practice for training intensity and duration distribution in endurance athletes? International Journal of Sports Physiology and Performance, 5(3), 276-291.",
      "Hawley, J.A. & Leckey, J.J. (2015). Carbohydrate Dependence During Prolonged, Intense Endurance Exercise. Sports Medicine, 45(1), 5-12.",
      "Laursen, P.B. & Jenkins, D.G. (2002). The scientific basis for high-intensity interval training. Sports Medicine, 32(1), 53-73.",
    ],
  },
};
