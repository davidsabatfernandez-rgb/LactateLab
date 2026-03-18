import { type ArticleContent } from "./articles";

export const ARTICLE_CONTENT_PART2: Record<string, ArticleContent> = {
  "threshold-training-guide": {
    title: "Entrenamiento en umbral: guia completa para mejorar tu LT2",
    slug: "threshold-training-guide",
    readTime: "6 min",
    metaDescription:
      "Aprende a entrenar cerca de tu umbral de lactato (LT2) con sesiones de tempo, cruise intervals y over-under. Progresion, recuperacion y senales de adaptacion.",
    heroAlt: "Corredor entrenando a ritmo de umbral en pista de atletismo",
    sections: [
      {
        heading: "Que es el entrenamiento en umbral y por que importa",
        body: `<p>El umbral de lactato (LT2) representa la intensidad maxima que puedes sostener durante un periodo prolongado — tipicamente entre 40 y 60 minutos en competicion — sin que el lactato se acumule de forma descontrolada en sangre. Entrenar cerca de esta zona es una de las estrategias mas efectivas para mejorar el rendimiento en deportes de resistencia, desde carreras de 10 km hasta triatlones de larga distancia.</p>
<p>La razon es sencilla: al estimular repetidamente los mecanismos de aclaramiento de lactato y la capacidad oxidativa de tus fibras musculares, tu cuerpo aprende a <strong>producir menos lactato a la misma intensidad</strong> y a <strong>eliminar mas rapido el que produce</strong>. El resultado es un desplazamiento hacia la derecha de tu curva de lactato — lo que se traduce en correr, pedalear o nadar mas rapido sin acumular fatiga metabolica.</p>
<p>Sin embargo, el entrenamiento en umbral requiere precision. Demasiado poco estimulo y no provocas adaptaciones significativas; demasiado y acumulas una fatiga que compromete la calidad de las sesiones siguientes. La clave esta en conocer tu LT2 con la mayor exactitud posible — idealmente mediante un test de lactato — y planificar sesiones que se muevan en una franja estrecha alrededor de esa intensidad.</p>`,
      },
      {
        heading: "Tipos de sesiones de umbral",
        body: `<p>No todas las sesiones de umbral son iguales. Existen tres formatos principales, cada uno con un proposito especifico dentro de tu plan de entrenamiento:</p>
<ul>
<li><strong>Tempo continuo:</strong> Esfuerzo sostenido durante 20-40 minutos a una intensidad ligeramente por debajo del umbral (aproximadamente 95-98% del ritmo LT2). Es la sesion clasica de umbral y la mas exigente mentalmente. Ideal para desarrollar la resistencia especifica y la confianza en mantener un ritmo constante.</li>
<li><strong>Cruise intervals:</strong> Bloques de 6-12 minutos al ritmo de umbral, separados por recuperaciones cortas de 60-90 segundos. La pausa permite acumular mas tiempo total en zona (hasta 30-45 minutos de trabajo efectivo) sin la fatiga neural del tempo continuo. Son el formato mas recomendable para la mayoria de los atletas.</li>
<li><strong>Over-under:</strong> Alternancia entre segmentos 10-15 segundos por encima del umbral y segmentos 10-15 segundos por debajo. Por ejemplo, 2 minutos al 103% seguidos de 2 minutos al 95%, repetidos durante 20-30 minutos. Este formato enseña al cuerpo a <strong>gestionar picos de lactato y recuperarse sin frenar</strong>, simulando lo que ocurre en competiciones con cambios de ritmo.</li>
</ul>
<p>Cada formato tiene su lugar. En fases tempranas de preparacion, los cruise intervals permiten acumular volumen en zona con menor riesgo de sobreentrenamiento. A medida que se acerca la competicion, los over-under y el tempo continuo preparan al cuerpo para las demandas especificas de la carrera.</p>`,
      },
      {
        heading: "Progresion semana a semana",
        body: `<p>El error mas comun en el entrenamiento de umbral es empezar demasiado agresivo. Un enfoque progresivo bien estructurado podria seguir esta secuencia a lo largo de 6-8 semanas:</p>
<ul>
<li><strong>Semanas 1-2:</strong> 2×10 minutos al ritmo de umbral con 2 minutos de recuperacion. Volumen total en zona: 20 minutos. El objetivo es familiarizarse con la intensidad y confirmar que el ritmo prescrito es correcto.</li>
<li><strong>Semanas 3-4:</strong> 3×10 minutos con 90 segundos de recuperacion, o 2×15 minutos con 2 minutos. Volumen en zona: 25-30 minutos.</li>
<li><strong>Semanas 5-6:</strong> 4×8 minutos con 60 segundos, o 2×20 minutos con 90 segundos. Se reduce la pausa y se mantiene o aumenta ligeramente el volumen.</li>
<li><strong>Semanas 7-8:</strong> 30-40 minutos de tempo continuo, o 3×12 minutos con 60 segundos, o sesiones over-under de 24-30 minutos. Volumen maximo en zona.</li>
</ul>
<p>Esta progresion funciona manipulando tres variables: <strong>duracion de los intervalos</strong>, <strong>duracion de la pausa</strong> y <strong>volumen total</strong>. Nunca deberias cambiar las tres a la vez. Aumenta una, estabiliza las otras, y progresa de forma conservadora.</p>
<p>Un indicador clave de que la progresion es correcta: al final de cada sesion deberias sentir que podrias haber hecho un intervalo mas, pero no dos. Si terminas destruido, la dosis fue excesiva.</p>`,
      },
      {
        heading: "Recuperacion entre sesiones de umbral",
        body: `<p>El entrenamiento de umbral genera una carga neuromuscular y metabolica significativa. La mayoria de los atletas necesitan <strong>al menos 48 horas</strong> entre sesiones de umbral para absorber el estimulo correctamente. Esto significa que, en la practica, la mayoria de los atletas recreativos pueden hacer <strong>1-2 sesiones de umbral por semana</strong>, mientras que atletas de alto nivel con mas anos de entrenamiento pueden tolerar hasta 3.</p>
<p>Los dias entre sesiones de umbral no tienen que ser de descanso completo. De hecho, las sesiones de baja intensidad (por debajo de LT1) promueven activamente la recuperacion al aumentar el flujo sanguineo sin generar fatiga adicional significativa. Un dia tipico de recuperacion podria incluir 40-60 minutos de carrera muy suave o un rodaje en bicicleta a intensidad conversacional.</p>
<p>Senales de alarma que indican que no estas recuperando lo suficiente entre sesiones:</p>
<ul>
<li>Incapacidad de alcanzar el ritmo objetivo en los ultimos intervalos</li>
<li>Frecuencia cardiaca significativamente mas alta de lo habitual para el mismo ritmo</li>
<li>Aumento progresivo de la percepcion de esfuerzo a lo largo de las semanas</li>
<li>Descenso de la variabilidad de la frecuencia cardiaca (HRV) basal</li>
</ul>`,
      },
      {
        heading: "Senales de adaptacion: como saber que funciona",
        body: `<p>Las adaptaciones al entrenamiento de umbral suelen manifestarse de forma gradual a lo largo de 4-8 semanas. Las senales mas fiables de que tu LT2 esta mejorando incluyen:</p>
<ul>
<li><strong>Menor frecuencia cardiaca al mismo ritmo:</strong> Si antes mantener 4:30/km requeria 170 lpm y ahora solo 165, tu eficiencia cardiovascular ha mejorado.</li>
<li><strong>Mayor velocidad al mismo esfuerzo percibido:</strong> Las sesiones que antes se sentian duras ahora resultan controlables.</li>
<li><strong>Mejor capacidad de mantener el ritmo en los ultimos intervalos:</strong> El fade (caida de ritmo) en los bloques finales se reduce.</li>
<li><strong>Confirmacion en test de lactato:</strong> La forma mas objetiva es repetir un test de campo con medicion de lactato. Si tu LT2 se ha desplazado a un ritmo mas rapido o la concentracion de lactato a la misma intensidad es menor, la adaptacion es real.</li>
</ul>
<p>Es importante tener paciencia. Los cambios fisiologicos profundos — como el aumento de la densidad mitocondrial, la mejora de la actividad enzimatica oxidativa y el incremento de la red capilar — requieren semanas de estimulo consistente. No esperes cambios dramaticos en un test tras 2-3 semanas de entrenamiento.</p>`,
      },
      {
        heading: "Cuando el entrenamiento de umbral NO es apropiado",
        body: `<p>A pesar de su efectividad, el entrenamiento de umbral no siempre es la mejor opcion. Hay situaciones en las que priorizarlo puede ser contraproducente:</p>
<ul>
<li><strong>Base aerobica insuficiente:</strong> Si llevas pocas semanas entrenando tras un periodo largo de inactividad, tu prioridad deberia ser construir una base aerobica solida con volumen a baja intensidad. El umbral se construye sobre cimientos aerobicos; sin esos cimientos, el estimulo sera excesivo y las adaptaciones superficiales.</li>
<li><strong>Fase de volumen alto:</strong> Si tu plan requiere picos de volumen semanal (por ejemplo, preparando un Ironman en fase de base), anadir sesiones de umbral puede llevar a una carga total insostenible.</li>
<li><strong>Estres acumulado:</strong> Periodos de alto estres laboral, falta de sueno cronica o enfermedad reciente reducen significativamente tu capacidad de absorber estimulos intensos. Es mejor mantener la intensidad baja y proteger la consistencia.</li>
<li><strong>Demasiado cerca de la competicion:</strong> En las 1-2 semanas previas a una competicion importante, el volumen de umbral deberia reducirse drasticamente. El objetivo del taper es llegar descansado, no acumular mas fitness en el ultimo momento.</li>
</ul>
<p>La regla general es: el entrenamiento de umbral es mas valioso en las fases de preparacion especifica (8-16 semanas antes de la competicion), cuando ya tienes una base solida y necesitas afinar la intensidad que usaras en carrera.</p>`,
      },
    ],
  },

  "race-prediction-from-lactate": {
    title: "Prediccion de tiempos de carrera a partir de datos de lactato",
    slug: "race-prediction-from-lactate",
    readTime: "5 min",
    metaDescription:
      "Descubre como los umbrales de lactato predicen tiempos de carrera con mayor precision que las calculadoras tradicionales. Ejemplos para 10K, media maraton y maraton.",
    heroAlt: "Corredor cruzando la meta con reloj GPS mostrando el tiempo",
    sections: [
      {
        heading: "Por que el lactato predice mejor que una calculadora generica",
        body: `<p>La mayoria de las calculadoras de tiempos de carrera funcionan con un principio simple: introduces el tiempo de una distancia reciente y el algoritmo extrapola a otras distancias usando una formula estandar. El problema es que estas formulas asumen que todos los corredores pierden rendimiento al mismo ritmo cuando aumenta la distancia, lo cual es fundamentalmente incorrecto.</p>
<p>Un corredor con un VO2max alto pero un umbral de lactato bajo (es decir, mucho motor pero poca eficiencia metabolica) rendira desproporcionadamente peor en distancias largas comparado con alguien que tiene un VO2max mas modesto pero un umbral proporcionalmente mas alto. Las calculadoras genericas no capturan esta diferencia.</p>
<p>Los datos de lactato, en cambio, proporcionan informacion directa sobre <strong>el coste energetico real de correr a cada ritmo</strong> y sobre <strong>la intensidad maxima sostenible para cada duracion de carrera</strong>. Al conocer tu curva de lactato completa — no solo un punto aislado — es posible modelar con mayor precision como se comportara tu metabolismo en distancias que van desde 5 km hasta el maraton.</p>`,
      },
      {
        heading: "El modelo de coste energetico de carrera",
        body: `<p>La prediccion basada en lactato utiliza un principio fisiologico bien establecido: el coste energetico de correr a una velocidad determinada se puede calcular a partir de la relacion entre tu consumo de oxigeno y tu velocidad. Los estudios publicados en revistas como el <em>European Journal of Applied Physiology</em> (2011) y el <em>Journal of Sports Sciences</em> (2003) han demostrado que este modelo es significativamente mas preciso que las tablas de equivalencia tradicionales.</p>
<p>El proceso funciona asi:</p>
<ul>
<li><strong>Paso 1:</strong> El test de lactato determina tu LT2 (umbral de lactato) y, si hay suficientes datos, tu LT1 y tu capacidad aerobica global.</li>
<li><strong>Paso 2:</strong> A partir de estos datos, se estima la fraccion de tu capacidad maxima que puedes utilizar en cada distancia. Para un 10K, un corredor tipico puede mantener una intensidad cercana al 90-95% de su LT2. Para un maraton, esa fraccion baja al 75-85%.</li>
<li><strong>Paso 3:</strong> Conociendo tu velocidad al umbral y la fraccion utilizable, se calcula el ritmo objetivo para cada distancia.</li>
</ul>
<p>La diferencia clave es que las fracciones no son iguales para todos. Un corredor con alta capacidad aerobica (LT2 alto respecto a su VO2max) puede mantener un porcentaje mayor durante el maraton que alguien con un perfil mas "explosivo". El modelo basado en lactato captura estas diferencias individuales.</p>`,
      },
      {
        heading: "Ejemplos practicos: 10K, media maraton y maraton",
        body: `<p>Veamos como funciona con un ejemplo concreto. Supongamos un corredor con un LT2 a 4:15/km y un LT1 a 5:00/km:</p>
<ul>
<li><strong>10K:</strong> El modelo predice un ritmo de carrera entre 4:05-4:10/km (ligeramente por encima del umbral), con un tiempo estimado de 41-42 minutos. La fraccion de utilizacion para una carrera de ~40 minutos es alta, tipicamente del 100-103% del ritmo LT2.</li>
<li><strong>Media maraton:</strong> El ritmo se ajusta a 4:20-4:30/km (muy cerca del umbral o ligeramente por debajo), con una prediccion de 1:31-1:35. La fraccion es del 95-98% del LT2, dependiendo del perfil metabolico del atleta.</li>
<li><strong>Maraton:</strong> Aqui es donde las diferencias individuales mas importan. El modelo predice un ritmo de 4:40-4:55/km, con un tiempo de 3:17-3:27. La franja es mas amplia porque la fraccion utilizable (82-90%) depende enormemente de la base aerobica del corredor.</li>
</ul>
<p>Nota como la incertidumbre aumenta con la distancia. Para 10K, la prediccion suele tener un margen de error de 1-2%. Para maraton, puede llegar al 3-5%. Esto no es una limitacion del modelo, sino un reflejo de la realidad: hay mas variables que influyen en el rendimiento cuando corres durante 3+ horas (nutricion, termorregulacion, fatiga muscular periferica).</p>`,
      },
      {
        heading: "Rangos de confianza: por que importa la incertidumbre",
        body: `<p>Una prediccion de tiempo sin rango de confianza es peligrosa. Si un modelo te dice que puedes correr el maraton en 3:15 pero no te dice que el rango real es 3:10-3:22, puedes salir a un ritmo demasiado agresivo y sufrir un colapso metabolico despues del km 30.</p>
<p>Las predicciones basadas en lactato incluyen rangos de confianza por varias razones:</p>
<ul>
<li><strong>Variabilidad del test:</strong> Incluso con un protocolo estandarizado, la concentracion de lactato puede variar un 5-10% entre dias dependiendo del estado de recuperacion, la alimentacion y la temperatura ambiente.</li>
<li><strong>Condiciones de carrera:</strong> Calor, viento, desnivel y terreno afectan significativamente al rendimiento real.</li>
<li><strong>Factores no metabolicos:</strong> La experiencia en carrera, la estrategia de avituallamiento y la capacidad de sufrir son variables que ningun modelo fisiologico puede capturar completamente.</li>
</ul>
<p>En la practica, el rango de confianza es util para definir <strong>tres ritmos de carrera</strong>: un ritmo conservador (limite superior del rango), un ritmo objetivo (centro del rango) y un ritmo agresivo (limite inferior). La estrategia optima para la mayoria de los atletas es salir al ritmo conservador y, si se sienten bien despues del primer tercio de la carrera, progresar hacia el ritmo objetivo.</p>`,
      },
      {
        heading: "Limitaciones y consejos practicos",
        body: `<p>Aunque la prediccion basada en lactato es significativamente mas precisa que las calculadoras genericas, no es infalible. Hay varios factores que debes tener en cuenta:</p>
<ul>
<li><strong>El test debe ser reciente:</strong> Un test de lactato realizado hace 3 meses puede no reflejar tu estado actual si has entrenado de forma consistente. Para predicciones de carrera fiables, el test deberia tener menos de 6 semanas de antiguedad.</li>
<li><strong>El protocolo importa:</strong> Tests con escalones demasiado cortos (menos de 3 minutos) o con incrementos irregulares de intensidad pueden producir curvas de lactato que no representan tu fisiologia real en estado estable.</li>
<li><strong>La experiencia de carrera cuenta:</strong> Si nunca has corrido un maraton, incluso la mejor prediccion metabolica puede ser optimista. El cuerpo necesita adaptaciones especificas (resistencia muscular, tolerancia al impacto, gestion mental) que solo se desarrollan corriendo distancias largas en entrenamiento.</li>
<li><strong>Usa la prediccion como punto de partida:</strong> No como un numero grabado en piedra. El dia de la carrera, tu cuerpo te dara senales que ningun modelo puede predecir. La prediccion basada en lactato te da el mejor punto de referencia posible, pero la inteligencia tactica en carrera la pones tu.</li>
</ul>
<p>El mayor valor de estas predicciones no esta en el numero exacto, sino en la informacion sobre <strong>tu perfil metabolico</strong>. Saber que eres un corredor con alta eficiencia aerobica que rinde mejor en distancias largas — o lo contrario — te permite elegir objetivos realistas y disenar tu entrenamiento en consecuencia.</p>`,
      },
    ],
  },

  "how-often-lactate-test": {
    title: "Cada cuanto repetir un test de lactato: frecuencia optima segun tu fase de entrenamiento",
    slug: "how-often-lactate-test",
    readTime: "4 min",
    metaDescription:
      "Descubre la frecuencia ideal para repetir tests de lactato segun tu fase de entrenamiento: base, especifica y competicion. Cuando SI y cuando NO testear.",
    heroAlt: "Atleta realizando un test de lactato en campo con un analizador portatil",
    sections: [
      {
        heading: "Por que la frecuencia de test importa",
        body: `<p>Un test de lactato es una fotografia de tu estado fisiologico en un momento concreto. Como cualquier fotografia, tiene fecha de caducidad. Tus umbrales cambian constantemente en respuesta al entrenamiento, y entrenar con datos obsoletos es casi tan malo como entrenar sin datos.</p>
<p>Sin embargo, testar demasiado frecuentemente tiene sus propios problemas. Cada test requiere un dia de esfuerzo maximo o sub-maximo que interrumpe el flujo normal de entrenamiento. Ademas, los cambios fisiologicos profundos necesitan semanas para manifestarse — repetir un test una semana despues del anterior casi siempre producira resultados identicos (dentro del margen de error natural de la medicion).</p>
<p>La frecuencia optima depende fundamentalmente de dos factores: <strong>tu fase de entrenamiento</strong> (que determina la velocidad a la que cambian tus umbrales) y <strong>tu objetivo</strong> (que determina cuanta precision necesitas en tus zonas de entrenamiento).</p>`,
      },
      {
        heading: "Frecuencia segun fase de entrenamiento",
        body: `<p>Las adaptaciones fisiologicas no ocurren a la misma velocidad en todas las fases del plan. Esto es lo que la investigacion y la experiencia practica sugieren:</p>
<ul>
<li><strong>Fase de base (pretemporada):</strong> Un test cada <strong>8-12 semanas</strong> es suficiente. Durante esta fase, el entrenamiento es predominantemente de baja intensidad y las mejoras en el umbral son graduales. Testar con mas frecuencia raramente revela cambios significativos y puede generar frustracion si esperas mejoras rapidas. El test al inicio de la base establece el punto de partida; el siguiente al final de la base confirma las adaptaciones antes de entrar en trabajo especifico.</li>
<li><strong>Fase especifica (8-16 semanas antes de la competicion):</strong> Cada <strong>4-6 semanas</strong>. Esta es la fase donde los cambios en el umbral son mas rapidos, especialmente si incluyes sesiones de umbral y VO2max. Actualizar tus zonas con esta frecuencia garantiza que entrenas en las intensidades correctas durante el periodo mas critico de la preparacion.</li>
<li><strong>Fase de competicion y taper:</strong> Un unico test 3-4 semanas antes de la competicion objetivo para confirmar tu estado y ajustar las predicciones de ritmo de carrera. No testes durante el taper (ultimas 1-2 semanas) — el descanso puede producir valores atipicos y la ansiedad precompetitiva no ayuda a obtener resultados fiables.</li>
</ul>
<p>Para un atleta con una temporada tipica de 40-48 semanas, esto se traduce en <strong>4-6 tests por ano</strong> — suficientes para mantener zonas actualizadas sin sobrecargar el calendario de entrenamiento.</p>`,
      },
      {
        heading: "Que buscar en los datos de retest",
        body: `<p>Repetir un test no tiene sentido si no sabes interpretar las diferencias respecto al test anterior. Estos son los indicadores clave:</p>
<ul>
<li><strong>Desplazamiento del LT2 a la derecha:</strong> Si tu umbral ahora ocurre a un ritmo mas rapido (o potencia mas alta), tu capacidad aerobica ha mejorado. Este es el indicador mas relevante para la mayoria de los atletas de resistencia.</li>
<li><strong>Lactato basal mas bajo:</strong> Si el primer escalon del test muestra un lactato de reposo o caminando mas bajo que en el test anterior, tu capacidad de aclaramiento ha mejorado — una senal de buena base aerobica.</li>
<li><strong>Curva mas plana en la zona sub-umbral:</strong> Si el lactato se mantiene estable durante mas escalones antes de empezar a subir, significa que tu zona aerobica se ha ampliado. Esto es especialmente relevante para atletas de larga distancia.</li>
<li><strong>Frecuencia cardiaca mas baja a la misma intensidad:</strong> Si en el mismo escalon del test tu FC es 3-5 latidos mas baja, tu eficiencia cardiovascular ha mejorado.</li>
<li><strong>LT1 y LT2 se acercan:</strong> Si la brecha entre ambos umbrales se reduce (el LT1 sube proporcionalmente mas que el LT2), estas desarrollando una base aerobica mas eficiente — tipico de un atleta que responde bien al entrenamiento de volumen.</li>
</ul>
<p>Consejo practico: lleva un registro de tus tests con las mismas variables (ritmo, potencia, FC y lactato por escalon) para poder hacer comparaciones directas. Incluso mejor: usa una plataforma que almacene tu historial y te muestre la evolucion de forma grafica.</p>`,
      },
      {
        heading: "Cuando NO repetir el test",
        body: `<p>Hay situaciones en las que repetir un test de lactato producira datos poco fiables o directamente enganosos:</p>
<ul>
<li><strong>Tras una enfermedad o lesion reciente:</strong> Espera al menos 2 semanas de entrenamiento normal despues de recuperarte. El cuerpo en estado de recuperacion muestra respuestas de lactato atipicas que no reflejan tu capacidad real.</li>
<li><strong>En medio de un bloque de sobrecarga:</strong> Si estas en la semana mas dura de un mesociclo (semana de carga maxima), tus umbrales estaran temporalmente deprimidos por la fatiga acumulada. El test mostrara un rendimiento peor del real.</li>
<li><strong>Con menos de 3 semanas desde el ultimo test:</strong> A menos que hayas cambiado radicalmente tu entrenamiento (por ejemplo, volver de 3 semanas en altitud), los cambios seran imperceptibles y estaran dentro del margen de error natural.</li>
<li><strong>En condiciones ambientales muy diferentes:</strong> Un test a 35 grados no se puede comparar con un test a 15 grados. Si necesitas datos comparables, intenta testar en condiciones similares o, al menos, documenta la temperatura y la humedad para contextualizar los resultados.</li>
<li><strong>Cuando estas agotado mentalmente:</strong> El test de lactato requiere esfuerzo progresivo hasta intensidades altas. Si no estas preparado para darlo todo en los ultimos escalones, los datos del umbral seran artificialmente bajos.</li>
</ul>
<p>La regla general: testa cuando estes descansado, motivado y en un contexto que te permita rendir con normalidad. Un mal test es peor que ningun test, porque puede llevarte a entrenar con zonas incorrectas durante semanas.</p>`,
      },
    ],
  },

  "portable-lactate-analyzer-comparison": {
    title: "Comparativa de analizadores de lactato portatiles: guia de compra para atletas y entrenadores",
    slug: "portable-lactate-analyzer-comparison",
    readTime: "6 min",
    metaDescription:
      "Comparativa detallada de Lactate Plus, Lactate Pro 2 y EKF Biosen: precio, precision, tiras reactivas, volumen de muestra y facilidad de uso.",
    heroAlt: "Tres analizadores de lactato portatiles sobre una mesa con tiras reactivas",
    sections: [
      {
        heading: "Por que invertir en un analizador portatil",
        body: `<p>Hasta hace pocos anos, medir lactato en sangre requeria un laboratorio con equipamiento caro y personal cualificado. La llegada de los analizadores portatiles ha democratizado esta tecnologia, permitiendo que entrenadores y atletas autodirigidos realicen tests de campo con una precision aceptable para la toma de decisiones de entrenamiento.</p>
<p>La inversion inicial puede parecer significativa — entre 300 y 2.000 euros dependiendo del modelo — pero si consideras que un test de lactato en un centro de rendimiento cuesta entre 80 y 200 euros, el analizador se amortiza en 3-10 tests. Para un entrenador con multiples atletas, la amortizacion es aun mas rapida.</p>
<p>El mercado actual ofrece tres opciones principales que cubren distintas necesidades y presupuestos. Cada una tiene fortalezas y limitaciones que conviene conocer antes de decidir.</p>`,
      },
      {
        heading: "Lactate Plus: el mas accesible para autotest",
        body: `<p>El <strong>Lactate Plus</strong> (Nova Biomedical) es el analizador mas extendido entre atletas que se testean a si mismos y entrenadores personales. Su principal ventaja es la facilidad de uso.</p>
<ul>
<li><strong>Precio del dispositivo:</strong> Aproximadamente 350-450 euros.</li>
<li><strong>Coste por tira reactiva:</strong> 3-4 euros por tira (se venden en lotes de 25 o 72).</li>
<li><strong>Volumen de muestra:</strong> 0.7 microlitros — una gota muy pequena es suficiente.</li>
<li><strong>Tiempo de resultado:</strong> 13 segundos.</li>
<li><strong>Rango de medicion:</strong> 0.3-25.0 mmol/L.</li>
<li><strong>Precision:</strong> Coeficiente de variacion del 4-5% segun estudios independientes publicados en el <em>Journal of Sports Science & Medicine</em> (2012). Esto significa que una lectura de 4.0 mmol podria realmente ser 3.8-4.2 mmol.</li>
</ul>
<p>El Lactate Plus es ideal para <strong>atletas que se testean solos</strong> porque el proceso es simple: puncion en el lobulo de la oreja o la yema del dedo, aplicar la sangre a la tira ya insertada en el dispositivo, y esperar 13 segundos. No requiere calibracion manual (las tiras vienen pre-calibradas con un chip por lote).</p>
<p>Su principal limitacion es que necesita una buena tecnica de puncion para obtener una gota suficiente en el primer intento. Si la muestra es demasiado pequena, la tira se desperdicia y hay que repetir con una nueva.</p>`,
      },
      {
        heading: "Lactate Pro 2: compacto y rapido",
        body: `<p>El <strong>Lactate Pro 2</strong> (Arkray) es la evolucion del legendario Lactate Pro original, que fue durante anos el estandar en medicion de campo. Es extremadamente compacto — del tamano de un glucometro — y rapido.</p>
<ul>
<li><strong>Precio del dispositivo:</strong> Aproximadamente 450-550 euros.</li>
<li><strong>Coste por tira reactiva:</strong> 4-5 euros por tira (lotes de 25).</li>
<li><strong>Volumen de muestra:</strong> 0.3 microlitros — el menor de los tres, lo que facilita mucho la toma de muestra.</li>
<li><strong>Tiempo de resultado:</strong> 15 segundos.</li>
<li><strong>Rango de medicion:</strong> 0.5-25.0 mmol/L.</li>
<li><strong>Precision:</strong> Coeficiente de variacion del 3-4%, ligeramente mejor que el Lactate Plus en la mayoria de los estudios comparativos.</li>
</ul>
<p>La ventaja mas destacada del Lactate Pro 2 es el <strong>minimo volumen de sangre requerido</strong>. Esto lo hace especialmente util en condiciones de frio (cuando la circulacion periferica se reduce y es dificil obtener gotas grandes) y para mediciones en el lobulo de la oreja, donde el flujo sanguineo es menor que en el dedo.</p>
<p>Su limitacion principal es el <strong>coste de las tiras</strong>, que son algo mas caras que las del Lactate Plus y, dependiendo del pais, pueden ser dificiles de encontrar. Planifica tus compras de tiras con antelacion, especialmente si realizas tests frecuentes.</p>`,
      },
      {
        heading: "EKF Biosen: precision de laboratorio en formato semi-portatil",
        body: `<p>El <strong>EKF Biosen</strong> (serie C-Line o S-Line) es un analizador de nivel clinico que ofrece la mayor precision del mercado. No es verdaderamente "de bolsillo" como los dos anteriores, pero es lo suficientemente compacto para usarse en campo con una mesa o soporte.</p>
<ul>
<li><strong>Precio del dispositivo:</strong> 1.500-2.500 euros (dependiendo del modelo y los accesorios).</li>
<li><strong>Coste por medicion:</strong> 1-2 euros (usa reactivos liquidos y capilares, no tiras).</li>
<li><strong>Volumen de muestra:</strong> 20 microlitros (recogidos con un capilar de vidrio).</li>
<li><strong>Tiempo de resultado:</strong> 20-45 segundos dependiendo del modelo.</li>
<li><strong>Rango de medicion:</strong> 0.5-40.0 mmol/L.</li>
<li><strong>Precision:</strong> Coeficiente de variacion del 1.5-2% — considerado el estandar de referencia para validar otros analizadores.</li>
</ul>
<p>El Biosen es la eleccion de <strong>centros de rendimiento, equipos profesionales y entrenadores que trabajan con muchos atletas</strong>. Su coste por medicion es el mas bajo de los tres (a pesar del precio inicial mas alto), y la precision es practicamente la de un laboratorio hospitalario.</p>
<p>La desventaja es la complejidad de uso. Requiere calibracion periodica con soluciones de referencia, mantenimiento del sistema de capilares, y una tecnica de toma de muestra mas elaborada. No es practico para un atleta que quiere testearse solo en el parque.</p>`,
      },
      {
        heading: "Cual elegir: guia de decision rapida",
        body: `<p>La eleccion depende de tu contexto:</p>
<ul>
<li><strong>Atleta que se testea solo o con un companero:</strong> <strong>Lactate Plus</strong>. La simplicidad de uso compensa la menor precision. El factor critico para el autotest es la facilidad de obtener la muestra y procesar el resultado rapidamente entre escalones del test.</li>
<li><strong>Entrenador con 3-10 atletas:</strong> <strong>Lactate Pro 2</strong>. El menor volumen de muestra facilita hacer tests de campo fluidos, y la precision adicional mejora la calidad de los datos cuando se analizan tendencias longitudinales.</li>
<li><strong>Centro de rendimiento o entrenador con +10 atletas:</strong> <strong>EKF Biosen</strong>. El menor coste por medicion hace que la inversion se recupere rapidamente con uso frecuente, y la precision superior importa cuando tomas decisiones clinicas o de alto rendimiento.</li>
</ul>
<p>Independientemente del dispositivo que elijas, la <strong>consistencia en el protocolo</strong> es mas importante que la precision absoluta del aparato. Usa siempre el mismo punto de puncion (oreja o dedo), el mismo protocolo de escalones, y las mismas condiciones ambientales. Esto asegura que las comparaciones entre tests sean validas, incluso si cada medicion individual tiene un margen de error del 3-5%.</p>
<p>Consejo final: compra siempre un 20-30% mas de tiras o reactivos de los que crees necesitar. Las muestras fallidas, las tiras defectuosas y las mediciones de confirmacion consumen material mas rapido de lo esperado.</p>`,
      },
      {
        heading: "Accesorios esenciales para el test de campo",
        body: `<p>Ademas del analizador, necesitaras un kit basico para realizar tests de campo de forma segura y eficiente:</p>
<ul>
<li><strong>Lancetas:</strong> Dispositivos de puncion con profundidad ajustable. Las lancetas de calibre 28-30G son las mas comunes. El lobulo de la oreja requiere menos profundidad que la yema del dedo.</li>
<li><strong>Guantes de nitrilo:</strong> Imprescindibles si testeas a otros atletas. Ademas de ser una medida de higiene basica, facilitan la manipulacion de la sangre sin contaminar la muestra.</li>
<li><strong>Algodones con alcohol:</strong> Para limpiar la zona de puncion antes de pinchar y para limpiar la primera gota (que puede contener lactato residual de la sudoracion o liquido intersticial).</li>
<li><strong>Cronometro o app de test:</strong> Para controlar la duracion de cada escalon del protocolo. La consistencia en los tiempos entre escalones es critica para la fiabilidad del test.</li>
<li><strong>Registro de datos:</strong> Una hoja de calculo o una app donde anotar ritmo/potencia, FC y lactato de cada escalon. Mejor aun: una plataforma como PeakAerobic que analiza automaticamente la curva y calcula los umbrales.</li>
</ul>
<p>Con el equipo adecuado y un poco de practica, un test de campo completo de 6-8 escalones se puede realizar en 30-40 minutos y proporciona datos comparables a los de un laboratorio de fisiologia del ejercicio.</p>`,
      },
    ],
  },

  "triathlon-zones-three-sports": {
    title: "Zonas de entrenamiento en triatlon: como gestionar intensidades en natacion, ciclismo y carrera",
    slug: "triathlon-zones-three-sports",
    readTime: "7 min",
    metaDescription:
      "Guia completa para establecer y gestionar zonas de entrenamiento en las tres disciplinas del triatlon. Tests por deporte, FC vs ritmo vs potencia, y zona drift en brick sessions.",
    heroAlt: "Triatleta saliendo del agua hacia la zona de transicion con bicicleta",
    sections: [
      {
        heading: "Por que las zonas son diferentes en cada deporte",
        body: `<p>Uno de los errores mas frecuentes en triatlon es asumir que las zonas de entrenamiento son transferibles entre disciplinas. Un triatleta puede tener un LT2 a 165 lpm en carrera, 158 lpm en ciclismo y 150 lpm en natacion — y ninguno de estos numeros es "incorrecto".</p>
<p>La razon principal es la <strong>masa muscular activa</strong>. Correr involucra practicamente toda la musculatura del tren inferior mas estabilizadores del core. Pedalear recluta menos masa muscular total (predominantemente cuadriceps, gluteos e isquiotibiales). Nadar utiliza un patron muscular completamente diferente, con mayor protagonismo del tren superior. A mayor masa muscular activa, mayor demanda cardiovascular, y por tanto mayor frecuencia cardiaca al mismo nivel de esfuerzo metabolico.</p>
<p>Ademas, la posicion corporal influye. En natacion, la posicion horizontal reduce el retorno venoso y la frecuencia cardiaca maxima comparada con la posicion vertical de la carrera. En ciclismo, la posicion sentada y el soporte del sillin reducen el componente isometrico de estabilizacion, bajando tambien la demanda cardiovascular respecto a correr.</p>
<p>La consecuencia practica es clara: <strong>necesitas zonas independientes para cada disciplina</strong>. Usar las mismas zonas de frecuencia cardiaca para las tres es una receta para entrenar demasiado duro en natacion y demasiado suave en carrera (o viceversa).</p>`,
      },
      {
        heading: "Como testar cada disciplina",
        body: `<p>El test de lactato es el metodo mas preciso para establecer zonas en cualquier disciplina, pero el protocolo varia segun el deporte:</p>
<ul>
<li><strong>Carrera:</strong> El protocolo mas estandar consiste en escalones de 3-4 minutos con incrementos de 0.5 km/h (o 10-15 segundos por km) empezando desde un ritmo muy comodo. Se mide lactato, FC y ritmo al final de cada escalon. Se puede realizar en pista, pista de atletismo cubierta o cinta de correr (preferiblemente con inclinacion del 1% para simular la resistencia del aire).</li>
<li><strong>Ciclismo:</strong> Escalones de 3-5 minutos con incrementos de 20-30 vatios, empezando desde una potencia baja (tipicamente 100-120W). El rodillo con medidor de potencia es el entorno ideal porque permite controlar la intensidad con precision. Se mide lactato, FC y potencia. Si no tienes medidor de potencia, puedes usar velocidad en un tramo llano y sin viento, aunque la precision sera menor.</li>
<li><strong>Natacion:</strong> El mas complejo de los tres. Escalones de 200-400 metros con incrementos de 5-10 segundos por 100m, empezando a ritmo muy suave. La medicion de lactato se hace en el borde de la piscina inmediatamente al terminar cada escalon (la sangre debe tomarse en los primeros 30-60 segundos). La frecuencia cardiaca se puede medir con pulsometro de agua o manualmente en el borde.</li>
</ul>
<p>Lo ideal es realizar los tres tests en semanas separadas (o al menos en dias distintos con al menos 48 horas de separacion) para que la fatiga de un test no contamine los resultados del siguiente.</p>`,
      },
      {
        heading: "Frecuencia cardiaca vs ritmo vs potencia: que metrica usar en cada deporte",
        body: `<p>Cada disciplina tiene una metrica "principal" que deberia guiar tu intensidad durante el entrenamiento:</p>
<ul>
<li><strong>Natacion: ritmo por 100 metros.</strong> La frecuencia cardiaca en natacion es poco fiable durante la sesion (dificil de medir con precision) y esta influenciada por la tecnica, la posicion del cuerpo y las pausas en la pared. El ritmo por 100m, medido con reloj GPS de aguas abiertas o con el reloj de la piscina, es la referencia mas practica. Si tu LT2 de natacion esta en 1:45/100m, ese es tu ancla.</li>
<li><strong>Ciclismo: potencia (vatios).</strong> Si tienes medidor de potencia, es la metrica mas fiable porque es instantanea, no se ve afectada por el terreno, el viento o la temperatura, y no tiene el retardo de la frecuencia cardiaca. Si no tienes medidor de potencia, la FC es la siguiente mejor opcion, con la salvedad de que tiene un retraso de 1-3 minutos respecto al esfuerzo real.</li>
<li><strong>Carrera: ritmo (min/km) con FC como validacion.</strong> El ritmo es la metrica principal porque es facil de seguir en tiempo real y se correlaciona bien con la intensidad metabolica. Sin embargo, el ritmo se ve afectado por el desnivel, el terreno y el viento, asi que la FC sirve como "control de calidad" — si el ritmo es correcto pero la FC esta inusualmente alta, algo no va bien (fatiga acumulada, calor, deshidratacion).</li>
</ul>
<p>En triatlon, donde entrenas tres disciplinas diferentes, tener claridad sobre que metrica guia cada sesion evita la confusion y la sobrecarga de datos.</p>`,
      },
      {
        heading: "Ironman vs distancia olimpica: como cambian las zonas objetivo",
        body: `<p>La distancia de competicion tiene un impacto directo en la zona de intensidad objetivo para el dia de carrera, y esto deberia influir en como distribuyes tu entrenamiento:</p>
<ul>
<li><strong>Distancia olimpica (1.5k/40k/10k, ~2 horas):</strong> La intensidad de carrera se situa muy cerca del LT2 en las tres disciplinas. El ciclismo puede estar al 95-100% del umbral de potencia, y la carrera final al 95-100% del ritmo LT2. La proporcion de entrenamiento de umbral en tu plan deberia ser significativa.</li>
<li><strong>Media distancia (1.9k/90k/21k, ~4-5 horas):</strong> La intensidad baja al 85-92% del umbral. El ciclismo esta claramente por debajo del LT2 pero por encima del LT1, y la carrera sigue un patron similar. Aqui importa tanto el umbral como la eficiencia en zona sub-umbral.</li>
<li><strong>Ironman (3.8k/180k/42k, ~9-14 horas):</strong> La intensidad de carrera esta al 70-82% del LT2. El ciclismo se realiza predominantemente en la zona entre LT1 y LT2 (zona "tempo suave"), y la carrera en maraton esta alrededor del LT1 o ligeramente por encima. La base aerobica — la capacidad de mantener una intensidad moderada durante horas — es el factor limitante.</li>
</ul>
<p>La implicacion para el entrenamiento es profunda. Un triatleta de distancia olimpica necesita proporcionalmente mas trabajo de umbral y VO2max. Un ironman necesita una base aerobica masiva y la capacidad de utilizar grasas como combustible a intensidades relativamente altas. Ambos necesitan conocer sus zonas con precision, pero las zonas que mas importan son diferentes.</p>`,
      },
      {
        heading: "Brick sessions y zona drift: el fenomeno del desacoplamiento",
        body: `<p>Las <strong>brick sessions</strong> — sesiones combinadas donde encadenas dos disciplinas sin descanso (tipicamente bici + carrera) — son un componente esencial del entrenamiento de triatlon. Y son tambien donde las zonas de entrenamiento se vuelven mas complicadas.</p>
<p>El fenomeno del <strong>desacoplamiento cardiaco</strong> (o "cardiac drift") se manifiesta de forma especialmente pronunciada en las brick sessions. Despues de 60-90 minutos de ciclismo, tu frecuencia cardiaca en la carrera posterior sera 5-15 latidos mas alta de lo normal para el mismo ritmo. Esto ocurre por la deshidratacion progresiva, la reduccion del volumen plasmatico, el aumento de la temperatura corporal y la fatiga muscular acumulada.</p>
<p>Esto tiene una implicacion practica directa: <strong>en la carrera de una brick, debes guiarte por el ritmo, no por la frecuencia cardiaca</strong>. Si intentas mantener tu zona de FC habitual, correras demasiado lento. Si intentas mantener tu ritmo de siempre ignorando una FC desbocada, puedes sobrepasar tu capacidad metabolica real.</p>
<p>La solucion es conocer tu "factor de brick": la diferencia entre tu ritmo habitual a una FC determinada y el ritmo que puedes mantener tras salir de la bici. Este factor varia entre atletas y mejora con el entrenamiento especifico de transiciones. Con el tiempo y la practica, el desacoplamiento se reduce — es una de las adaptaciones mas importantes para el rendimiento en triatlon.</p>
<p>Consejo practico: en tus primeras brick sessions, corre los primeros 10-15 minutos deliberadamente mas lento de lo que tu ritmo objetivo indica. Deja que el cuerpo se adapte a la transicion y evalua como te sientes antes de subir la intensidad. Esta paciencia al inicio de la carrera es exactamente lo que separa a los triatletas con buenas transiciones de los que explotan en el segmento final.</p>`,
      },
      {
        heading: "Integrando las zonas de tres disciplinas en un plan coherente",
        body: `<p>Gestionar zonas en tres disciplinas puede parecer abrumador, pero hay principios que simplifican la tarea:</p>
<ul>
<li><strong>Prioriza la disciplina mas debil para los tests:</strong> Si tu natacion es tu punto debil, esa es la disciplina donde conocer tus zonas con precision tiene mas impacto en el rendimiento global.</li>
<li><strong>No entrenes intenso en las tres disciplinas el mismo dia:</strong> Si tienes una sesion de umbral en bici por la manana, la carrera de la tarde deberia ser regenerativa. La carga total del dia es lo que importa, no la carga de cada sesion individual.</li>
<li><strong>Usa una plataforma que integre las tres disciplinas:</strong> Llevar zonas en tres hojas de calculo separadas es una receta para la confusion. Una herramienta como PeakAerobic que almacena tus curvas de lactato por disciplina y calcula zonas automaticamente simplifica enormemente la gestion.</li>
<li><strong>Revisa las zonas de cada disciplina en momentos diferentes:</strong> No necesitas testar las tres disciplinas en la misma semana. Distribuye los tests a lo largo de la fase de preparacion, priorizando la disciplina donde esperas mas cambios.</li>
<li><strong>Acepta la imprecision en natacion:</strong> De las tres disciplinas, la natacion es donde los tests de lactato son mas dificiles de realizar con precision. Si no puedes hacer un test de lactato en piscina, un test de ritmo critico de natacion (por ejemplo, basado en tus mejores tiempos en 400m y 200m) es una alternativa razonable para establecer zonas aproximadas.</li>
</ul>
<p>El objetivo final no es tener zonas perfectas en las tres disciplinas, sino tener zonas <strong>suficientemente buenas para tomar decisiones de entrenamiento correctas</strong>. La diferencia entre un LT2 de natacion en 1:42/100m y 1:45/100m rara vez cambiara tu plan de entrenamiento de forma significativa. Lo que si lo cambiara es saber si tu limitante principal es la natacion, el ciclismo o la carrera — y eso requiere datos de cada disciplina.</p>`,
      },
    ],
  },

  "periodization-mesocycle-guide": {
    title: "Periodizacion y mesociclos: como estructurar tu entrenamiento de resistencia en bloques",
    slug: "periodization-mesocycle-guide",
    readTime: "8 min",
    metaDescription:
      "Aprende a organizar tu entrenamiento en mesociclos: fases de base, especifica, competicion y recuperacion. Patrones de carga, seleccion de bloques con datos de lactato y ejemplo practico de 16 semanas.",
    heroAlt: "Calendario de entrenamiento con bloques de colores representando diferentes fases de periodizacion",
    sections: [
      {
        heading: "Que es la periodizacion y por que la necesitas",
        body: `<p>La periodizacion es, en esencia, el arte de organizar el entrenamiento en el tiempo para llegar a la competicion en el mejor estado posible. En lugar de hacer siempre lo mismo semana tras semana — la trampa del "entrenamiento monotono" — la periodizacion divide la temporada en fases con objetivos diferentes, cargas diferentes y estimulos diferentes.</p>
<p>La razon fisiologica es que el cuerpo no puede desarrollar todas las capacidades al mismo tiempo con la misma eficiencia. Un bloque enfocado en la base aerobica (volumen alto, intensidad baja) produce adaptaciones centrales — corazon mas grande, mas sangre bombeada por latido, red capilar mas densa. Un bloque de umbral desarrolla la capacidad de las fibras musculares para oxidar lactato y mantener esfuerzos intensos. Un bloque de VO2max empuja el techo aerobico hacia arriba.</p>
<p>Intentar hacer todo a la vez produce estimulos diluidos: un poco de todo, pero nada con la dosis suficiente para generar adaptaciones profundas. La periodizacion resuelve esto concentrando el estimulo: durante 3-6 semanas, el enfoque principal es uno, y los demas se mantienen en "modo mantenimiento".</p>
<p>Investigaciones publicadas en el <em>International Journal of Sports Physiology and Performance</em> (2014) y el <em>Sports Medicine</em> (2010) han demostrado consistentemente que los planes periodizados producen mejoras significativamente mayores que los planes no periodizados con el mismo volumen total de entrenamiento.</p>`,
      },
      {
        heading: "Las fases de una temporada",
        body: `<p>Una temporada tipica de un atleta de resistencia se divide en cuatro grandes fases:</p>
<ul>
<li><strong>Fase de base (8-16 semanas):</strong> El cimiento de todo lo que viene despues. El objetivo principal es construir capacidad aerobica mediante volumen a baja intensidad (por debajo del LT1). Se complementa con algo de trabajo de fuerza y tecnica. Al final de esta fase, tu lactato basal deberia ser mas bajo y tu curva de lactato deberia mantenerse plana durante mas escalones de intensidad antes de empezar a subir.</li>
<li><strong>Fase especifica (6-12 semanas):</strong> Aqui se introduce progresivamente el trabajo en zona de umbral y por encima. El volumen total puede mantenerse o reducirse ligeramente para hacer hueco a la intensidad. Es la fase donde se producen las mayores mejoras en el LT2 — tipicamente un desplazamiento de 5-15 segundos por km en corredores o 10-20 vatios en ciclistas durante un bloque especifico bien ejecutado.</li>
<li><strong>Fase precompetitiva (3-6 semanas):</strong> Se afinan los detalles. Las sesiones de alta intensidad se mantienen pero el volumen total se reduce progresivamente. Se incluyen simulaciones de carrera, sesiones a ritmo objetivo y, en triatlon, brick sessions. El cuerpo acumula las ultimas adaptaciones mientras empieza a "absorber" la carga de las semanas anteriores.</li>
<li><strong>Taper y competicion (1-3 semanas):</strong> Reduccion significativa del volumen (40-60%) manteniendo la intensidad. El objetivo es llegar descansado pero con el sistema neuromuscular activado. Un taper bien ejecutado puede mejorar el rendimiento entre un 2 y un 6% segun la literatura cientifica.</li>
</ul>
<p>Despues de la competicion objetivo, se incluye una fase de <strong>transicion o recuperacion</strong> (2-4 semanas) de actividad libre, sin estructura, que permite la recuperacion fisica y mental antes de iniciar el siguiente macrociclo.</p>`,
      },
      {
        heading: "El mesociclo: la unidad basica de planificacion",
        body: `<p>Un <strong>mesociclo</strong> es un bloque de entrenamiento de 2-6 semanas (tipicamente 3-4) con un objetivo fisiologico especifico. Es la unidad de planificacion mas importante porque es donde ocurre la magia de la adaptacion: aplicas un estimulo, acumulas carga, te recuperas, y emerges mas fuerte.</p>
<p>La estructura interna de un mesociclo sigue el principio de <strong>sobrecarga progresiva seguida de recuperacion</strong>. Los dos patrones mas comunes son:</p>
<ul>
<li><strong>3+1 (tres semanas de carga + una de descarga):</strong> Es el patron mas extendido. Las tres semanas de carga progresan en volumen o intensidad (o ambos), y la cuarta semana reduce la carga un 30-50% para permitir la supercompensacion. Adecuado para la mayoria de los atletas.</li>
<li><strong>2+1 (dos semanas de carga + una de descarga):</strong> Mas conservador, indicado para atletas masters (>40 anos), atletas con alta carga de estres fuera del deporte, o en fases de intensidad muy alta donde la acumulacion de fatiga es mas rapida.</li>
</ul>
<p>Dentro de las semanas de carga, la progresion tipica es:</p>
<ul>
<li><strong>Semana 1 (carga moderada):</strong> Introduccion del estimulo. Las sesiones clave tienen un volumen o intensidad algo menor que el maximo del mesociclo.</li>
<li><strong>Semana 2 (carga alta):</strong> Progresion. Se aumenta la duracion de los intervalos, se reduce la pausa, o se anade una sesion clave adicional.</li>
<li><strong>Semana 3 (carga maxima):</strong> El pico del mesociclo. La semana mas exigente, disenada para provocar la maxima sobrecarga tolerada.</li>
<li><strong>Semana 4 (descarga):</strong> Reduccion. Se mantienen 1-2 sesiones de intensidad a volumen reducido para no perder las adaptaciones, pero el volumen total y la carga bajan significativamente.</li>
</ul>`,
      },
      {
        heading: "Tipos de mesociclo segun el objetivo fisiologico",
        body: `<p>No todos los mesociclos son iguales. El tipo de bloque que necesitas depende de tu fase de entrenamiento, tu perfil fisiologico y tu objetivo de competicion. Estos son los tipos mas comunes:</p>
<ul>
<li><strong>Bloque de capacidad aerobica:</strong> Enfocado en volumen a baja intensidad. Las sesiones clave son rodajes largos, tiradas largas de carrera y series largas en piscina — todo por debajo del LT1. Complementado con sesiones de fuerza. Tipico de la fase de base. Duracion recomendada: 4-6 semanas.</li>
<li><strong>Bloque de desarrollo de umbral:</strong> Las sesiones clave incluyen tempo continuo, cruise intervals y over-under. El volumen total puede reducirse ligeramente para acomodar la intensidad. Tipico de la transicion base-especifica. Duracion: 3-4 semanas.</li>
<li><strong>Bloque de potencia aerobica (VO2max):</strong> Intervalos cortos a alta intensidad (3-5 minutos al 95-105% del VO2max) con recuperaciones completas. Es el bloque mas agresivo y requiere una base solida previa. Tipico de la fase especifica avanzada. Duracion: 2-3 semanas.</li>
<li><strong>Bloque de capacidad anaerobica:</strong> Incluye repeticiones cortas y explosivas (20-60 segundos) combinadas con trabajo aerobico de base. Su objetivo es elevar la potencia maxima y la capacidad glucolitica. Indicado para distancias cortas o para atletas con un perfil excesivamente "diesel". Duracion: 2-3 semanas.</li>
<li><strong>Bloque de competicion:</strong> Combina sesiones a ritmo de carrera con trabajo de umbral y VO2max en proporciones reducidas. El enfoque es la especificidad: simular las demandas de la competicion objetivo. Duracion: 3-4 semanas.</li>
</ul>
<p>La seleccion del tipo de bloque no deberia ser aleatoria. Aqui es donde los datos de lactato aportan un valor enorme.</p>`,
      },
      {
        heading: "Como el lactato informa la seleccion de bloques",
        body: `<p>Tu curva de lactato te dice, en terminos fisiologicos, cuales son tus puntos fuertes y debiles. Y esa informacion determina que tipo de mesociclo te dara el mayor retorno:</p>
<ul>
<li><strong>LT1 bajo (lactato empieza a subir muy pronto):</strong> Indica una base aerobica insuficiente. Prioridad: bloque de capacidad aerobica. Necesitas mas horas a baja intensidad para ampliar tu zona aerobica antes de intentar empujar el umbral hacia arriba.</li>
<li><strong>Gran brecha entre LT1 y LT2:</strong> Tienes base pero no eficiencia metabolica a intensidades moderadas-altas. Prioridad: bloque de umbral. Las sesiones de tempo y cruise intervals son las que mas impacto tendran.</li>
<li><strong>LT2 alto pero VO2max limitado:</strong> Tu motor metabolico es eficiente pero tu techo aerobico es bajo. Prioridad: bloque de potencia aerobica. Necesitas empujar el VO2max hacia arriba para dar mas "espacio" al umbral.</li>
<li><strong>Curva muy plana con subida explosiva al final:</strong> Perfil de corredor de fondo con alta eficiencia aerobica pero baja capacidad glucolitica. Si tu evento es de larga distancia, esto es una fortaleza. Si tu evento es de 5-10 km, un bloque de capacidad anaerobica puede elevar tu rendimiento en esas distancias.</li>
<li><strong>Ratio LT1/LT2 muy alto (los dos umbrales estan muy cerca):</strong> Indica un sistema aerobico muy desarrollado. En este caso, un bloque mas agresivo (VO2max o capacidad anaerobica) puede producir mejoras que un bloque conservador de base no conseguiria.</li>
</ul>
<p>El test de lactato se convierte asi en una brujula que guia la seleccion de bloques. Sin datos, la eleccion es una suposicion educada. Con datos, es una decision informada. La diferencia en resultados a lo largo de una temporada puede ser significativa.</p>`,
      },
      {
        heading: "Ejemplo practico: plan de 16 semanas para un medio maraton",
        body: `<p>Veamos como se ensambla todo en un ejemplo concreto. Un corredor con LT2 a 4:30/km que quiere correr un medio maraton en menos de 1:35 podria estructurar sus 16 semanas asi:</p>
<ul>
<li><strong>Semanas 1-4: Mesociclo de capacidad aerobica (3+1).</strong> Volumen semanal progresivo: 50-55-60-45 km. Sesiones clave: tirada larga de 18-22 km + sesion de ritmo sub-LT1. Intensidad predominante: Z1-Z2 (por debajo de LT1). Test de lactato al inicio para establecer zonas.</li>
<li><strong>Semanas 5-8: Mesociclo de desarrollo de umbral (3+1).</strong> Volumen: 55-58-60-45 km. Sesiones clave: cruise intervals (3-4×8' a ritmo LT2) + tirada larga con ultimos km a ritmo sub-umbral. Progresion de intervalos: aumentar duracion de 8 a 10 minutos, reducir pausa de 2 a 90 segundos. Test de lactato en la semana 8 (durante la descarga) para validar mejoras y ajustar zonas.</li>
<li><strong>Semanas 9-12: Mesociclo de potencia aerobica + umbral (3+1).</strong> Volumen: 55-55-58-42 km. Sesiones clave: VO2max (5×4' a 3:50-4:00/km con 3' recuperacion) + tempo continuo de 25-30'. La combinacion de VO2max y umbral produce el mayor estimulo de rendimiento en esta fase. Test de lactato en la semana 12.</li>
<li><strong>Semanas 13-15: Mesociclo precompetitivo (2+1).</strong> Volumen: 50-52-40 km. Sesiones clave: simulacion de carrera (10-12 km a ritmo objetivo de 4:25-4:30/km) + sesion de ritmos variados (6×1km a 4:10-4:20 con 2' trote). Se reduce el volumen de las sesiones de intensidad pero se mantiene la especificidad.</li>
<li><strong>Semana 16: Taper + carrera.</strong> Volumen: 25-30 km. 2-3 sesiones suaves con 2-3 activaciones cortas (4×200m al ritmo de carrera). Dia previo: descanso o trote muy suave de 15-20 minutos. Dia de carrera: ejecutar el plan segun las zonas establecidas por los tests de lactato.</li>
</ul>
<p>Este plan no es una receta universal — deberia ajustarse al nivel del atleta, su historial de entrenamiento, su disponibilidad de horas y sus respuestas individuales. Pero ilustra como la periodizacion en mesociclos crea una progresion logica desde la base hasta la competicion, donde cada bloque construye sobre las adaptaciones del anterior.</p>`,
      },
      {
        heading: "Errores comunes y como evitarlos",
        body: `<p>La periodizacion parece sencilla en teoria, pero en la practica hay trampas frecuentes:</p>
<ul>
<li><strong>Saltarse la fase de base:</strong> Es el error mas comun y el mas costoso. La tentacion de empezar directamente con trabajo de umbral o VO2max es fuerte, especialmente cuando te sientes en forma. Pero sin una base aerobica solida, las adaptaciones de umbral seran superficiales y la fatiga acumulada te obligara a retroceder antes de lo previsto.</li>
<li><strong>Semanas de descarga insuficientes:</strong> Muchos atletas ven la semana de descarga como "tiempo perdido". En realidad, es cuando ocurre la supercompensacion — el proceso por el cual el cuerpo se adapta al estimulo de las semanas previas. Reducir la descarga (o saltarsela) acumula fatiga cronica que eventualmente se manifiesta como estancamiento o lesion.</li>
<li><strong>Demasiada variedad dentro de un mesociclo:</strong> Un bloque de 3 semanas donde haces VO2max el lunes, tempo el miercoles, sprints el viernes y tirada larga el domingo no es un mesociclo enfocado — es entrenamiento aleatorio con nombre bonito. Elige 1-2 estimulos principales y complementa con trabajo de mantenimiento.</li>
<li><strong>No ajustar segun la respuesta individual:</strong> El plan es un punto de partida, no un contrato. Si llegas a la semana 2 de un bloque de umbral con senales claras de fatiga excesiva (rendimiento que cae, FC elevada, sueno alterado), la decision correcta es reducir la carga, no forzar para cumplir el plan.</li>
<li><strong>Ignorar los datos de lactato entre bloques:</strong> Si tienes acceso a tests de lactato, usalos para validar que las adaptaciones esperadas estan ocurriendo. Si tras un bloque de 4 semanas de umbral tu LT2 no se ha movido, necesitas reconsiderar la dosis, el tipo de estimulo o la recuperacion — no simplemente repetir el mismo bloque esperando resultados diferentes.</li>
</ul>
<p>La periodizacion exitosa requiere dos cualidades aparentemente opuestas: <strong>disciplina para seguir el plan</strong> y <strong>flexibilidad para ajustarlo</strong> cuando los datos (objetivos o subjetivos) lo piden. Los mejores entrenadores no son los que escriben los planes mas bonitos, sino los que mejor leen las senales de sus atletas y ajustan en consecuencia.</p>`,
      },
    ],
  },
};
