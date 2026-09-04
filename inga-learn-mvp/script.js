/**
 * ==============================================================================
 * PROYECTO: APRENDIZAJE INGA - SUMA KAUGSAI
 * VARIANTE: Santiago, Putumayo (Valle de Sibundoy)
 * ARQUITECTURA: Modular, RAG Determinista Cero-Alucinaciones & Web Speech API
 * ==============================================================================
 * 
 * Este archivo implementa:
 * 1. Carga asíncrona de la base de conocimiento local (datos.json) como Única Fuente de Verdad.
 * 2. Motor RAG con System Prompt estricto (Zero-Hallucination) para el Profesor Virtual.
 * 3. Módulo de Voz Nativo:
 *    - Text-to-Speech (TTS): Fonética pausada para el Inga.
 *    - Speech-to-Text (STT): Reconocimiento y comparación con similitud pedagógica (Levenshtein).
 * 4. Control de UI interactiva (Filtros, Buscador, Modal de práctica, Chatbot).
 */

// ==============================================================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// ==============================================================================
const AppState = {
  data: [],                 // Almacén de términos cargados desde datos.json
  activeCategory: 'todos',  // Categoría seleccionada para filtrar
  searchQuery: '',          // Consulta del buscador en tiempo real
  currentPracticeItem: null,// Elemento Inga actualmente en práctica fonética
  recognitionInstance: null,// Instancia de SpeechRecognition (si es soportada)
  isListening: false        // Estado activo del micrófono
};

// ==============================================================================
// 2. SISTEMA Y PROMPT DE CONTROL RAG (ZERO-HALLUCINATION)
// ==============================================================================
/**
 * SYSTEM PROMPT DEL PROFESOR INGA VIRTUAL:
 * 
 * "Eres el 'Profesor Inga Virtual', un sabedor y pedagogo cultural de Santiago, Putumayo,
 * guiado por el principio supremo del 'Suma Kaugsai' (Pensar bonito es vivir bonito).
 * 
 * REGLA ESTRICTA DE CERO ALUCINACIÓN:
 * 1. Solo estás autorizado a responder dudas de traducción, gramática, pronunciación y cosmovisión
 *    utilizando EXCLUSIVAMENTE el semillero oficial de términos en 'datos.json'.
 * 2. Si el usuario solicita un término, expresión, traducción o concepto que NO está registrado
 *    en 'datos.json', DEBES responder EXACTAMENTE:
 *    'Esa palabra o expresión aún no se encuentra en nuestro registro oficial de Santiago, Putumayo.'
 * 3. Queda terminantemente prohibido inventar traducciones, recurrir a quechuas de otros países
 *    o suponer significados no corroborados por la comunidad local."
 */
const STRICT_UNREGISTERED_MESSAGE = "Esa palabra o expresión aún no se encuentra en nuestro registro oficial de Santiago, Putumayo.";

// ==============================================================================
// 3. CARGA ASÍNCRONA DE DATOS (FETCH NATIVO)
// ==============================================================================
/**
 * Carga el archivo datos.json mediante fetch() asíncrono y dispara la renderización inicial.
 */
async function cargarBaseDeDatos() {
  const container = document.getElementById('cards-container');
  try {
    const response = await fetch('datos.json');
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} al cargar datos.json`);
    }

    const data = await response.json();
    AppState.data = data;
    console.log(`[Fuente de Verdad] ${data.length} términos del Inga cargados con éxito.`);

    // Renderizar tarjetas y actualizar contadores
    renderizarTarjetas();
    actualizarEstadisticas();
  } catch (error) {
    console.error("Error al cargar la base de datos local:", error);
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 2rem; background: #FEE2E2; border-radius: 12px; color: #991B1B;">
          <h3>⚠️ Error al conectar con la base de datos local</h3>
          <p style="margin-top: 0.5rem;">No se pudo leer <code>datos.json</code>. Asegúrate de ejecutar este proyecto mediante un servidor local (ej. Live Server o <code>python -m http.server</code>) para permitir la lectura de archivos locales vía fetch.</p>
        </div>
      `;
    }
  }
}

// ==============================================================================
// 4. RENDERIZADO Y FILTRADO DE TARJETAS DE APRENDIZAJE
// ==============================================================================
/**
 * Renderiza dinámicamente las tarjetas del módulo "Aprender" según los filtros activos.
 */
function renderizarTarjetas() {
  const container = document.getElementById('cards-container');
  if (!container) return;

  const query = AppState.searchQuery.toLowerCase().trim();
  const category = AppState.activeCategory;

  const itemsFiltrados = AppState.data.filter(item => {
    const matchesCategory = (category === 'todos' || item.categoria.toLowerCase() === category.toLowerCase());
    const matchesSearch = (
      item.inga.toLowerCase().includes(query) ||
      item.espanol.toLowerCase().includes(query) ||
      item.significado_cultural.toLowerCase().includes(query)
    );
    return matchesCategory && matchesSearch;
  });

  if (itemsFiltrados.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #FFF; border-radius: 14px; border: 1px dashed #E7DFD3;">
        <p style="font-size: 1.1rem; color: #78716C;">No se encontraron términos para la búsqueda realizada.</p>
        <button onclick="limpiarFiltros()" style="margin-top: 0.8rem; background: var(--green-primary); color: white; border: none; padding: 0.5rem 1.2rem; border-radius: 20px; font-weight: 600; cursor: pointer;">Restablecer filtros</button>
      </div>
    `;
    return;
  }

  container.innerHTML = itemsFiltrados.map(item => `
    <article class="inga-card" data-id="${item.id}">
      <div class="card-top">
        <span class="badge-category badge-${item.categoria}">${item.categoria}</span>
        <span class="badge-type">${item.tipo}</span>
      </div>

      <h3 class="term-inga">${item.inga}</h3>
      <p class="term-spanish">${item.espanol}</p>

      <div class="phonetic-wrapper" title="Guía fonética silábica de Santiago">
        <span>🗣️</span>
        <code>${item.pronunciacion_guia}</code>
      </div>

      <div class="cultural-note">
        <div class="cultural-note-title">
          <span>🌿</span> Suma Kaugsai (Significado Ancestral)
        </div>
        <p>${item.significado_cultural}</p>
      </div>

      <div class="card-actions">
        <button class="btn-audio-listen" onclick="reproducirPronunciacion('${escapeHtml(item.inga)}', '${escapeHtml(item.pronunciacion_guia)}')">
          <span>🔊</span> Escuchar
        </button>
        <button class="btn-audio-practice" onclick="abrirModalPractica('${item.id}')">
          <span>🎙️</span> Practicar
        </button>
      </div>
    </article>
  `).join('');
}

function limpiarFiltros() {
  AppState.activeCategory = 'todos';
  AppState.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.category === 'todos');
  });

  renderizarTarjetas();
}

function actualizarEstadisticas() {
  const statCount = document.getElementById('stat-word-count');
  if (statCount) {
    statCount.textContent = `${AppState.data.length} términos registrados`;
  }
}

// ==============================================================================
// 5. FUNCIONES DE VOZ NATIVAS (WEB SPEECH API)
// ==============================================================================

/**
 * a) TEXTO A VOZ (SPEECH SYNTHESIS):
 * Reproduce la pronunciación en Inga configurando un ritmo pausado adaptado a la fonética nativa.
 * 
 * @param {string} textoInga - El término en Inga original.
 * @param {string} guiaSilabica - La guía silábica separada por guiones.
 */
function reproducirPronunciacion(textoInga, guiaSilabica = '') {
  if (!('speechSynthesis' in window)) {
    alert("Tu navegador no soporta la síntesis de voz (Web Speech API). Te recomendamos usar Google Chrome o Microsoft Edge.");
    return;
  }

  // Cancelar reproducciones anteriores en curso
  window.speechSynthesis.cancel();

  // Preferimos guiar la fonética reemplazando guiones por espacios sutiles para pausar cada sílaba
  const textoParaVoz = guiaSilabica ? guiaSilabica.replace(/-/g, ' ') : textoInga;

  const utterance = new SpeechSynthesisUtterance(textoParaVoz);
  utterance.lang = 'es-CO'; // Empleamos fonética colombiana (andina) como base acústica
  utterance.rate = 0.78;    // Ritmo pausado pedagógico (0.75 - 0.8)
  utterance.pitch = 0.95;   // Tono natural profundo

  // Retroalimentación visual en consola
  console.log(`[TTS Inga] Reproduciendo con ritmo pausado: "${textoParaVoz}"`);

  window.speechSynthesis.speak(utterance);
}

/**
 * b) RECONOCIMIENTO DE VOZ (SPEECH RECOGNITION) & COMPARADOR FONÉTICO
 */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Normaliza una cadena para comparación fonética tolerante en el contexto Inga.
 * Maneja equivalencias habituales de transcripción (k/c, w/u, etc.)
 */
function normalizarTextoFonico(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-z0-9\s]/g, "")     // Quitar signos especiales
    .replace(/\bqu/g, "k")           // Normalización fonética
    .replace(/c(?=[aou])/g, "k")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas.
 */
function calcularLevenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Sustitución
          matrix[i][j - 1] + 1,     // Inserción
          matrix[i - 1][j] + 1      // Eliminación
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Evalúa la precisión pedagógica entre la pronunciación capturada y el objetivo Inga.
 * Devuelve un porcentaje de 0 a 100 y una calificación cualitativa.
 */
function evaluarPronunciacionPedagogica(capturado, objetivo) {
  const normCapturado = normalizarTextoFonico(capturado);
  const normObjetivo = normalizarTextoFonico(objetivo);

  if (!normCapturado) return { porcentaje: 0, estado: 'retry', mensaje: 'No se detectó audio claro. Intenta de nuevo.' };
  if (normCapturado === normObjetivo) return { porcentaje: 100, estado: 'success', mensaje: '¡Suma! Pronunciación perfecta y armónica.' };

  const distancia = calcularLevenshtein(normCapturado, normObjetivo);
  const longitudMaxima = Math.max(normCapturado.length, normObjetivo.length);
  const similitudCruda = Math.max(0, (longitudMaxima - distancia) / longitudMaxima);

  // Escala pedagógica: premia el esfuerzo fonético aproximado
  const porcentaje = Math.round(similitudCruda * 100);

  if (porcentaje >= 80) {
    return {
      porcentaje,
      estado: 'success',
      mensaje: '¡Suma! Excelente pronunciación, se percibe la claridad del término.'
    };
  } else if (porcentaje >= 50) {
    return {
      porcentaje,
      estado: 'amber',
      mensaje: '¡Buen intento! Escucha la guía silábica pausada y repítelo una vez más.'
    };
  } else {
    return {
      porcentaje,
      estado: 'retry',
      mensaje: 'Reintenta con calma. El Inga requiere una pronunciación rítmica y suave.'
    };
  }
}

// ==============================================================================
// 6. CONTROL DEL MODAL DE PRÁCTICA FONÉTICA
// ==============================================================================
function abrirModalPractica(itemId) {
  const item = AppState.data.find(d => d.id === itemId);
  if (!item) return;

  AppState.currentPracticeItem = item;

  const modal = document.getElementById('practice-modal');
  const title = document.getElementById('practice-term');
  const phonetic = document.getElementById('practice-phonetic-text');
  const resultBox = document.getElementById('voice-result-box');
  const micStatus = document.getElementById('mic-status-text');

  if (title) title.textContent = item.inga;
  if (phonetic) phonetic.textContent = `Guía: ${item.pronunciacion_guia}`;
  if (resultBox) resultBox.className = 'voice-result-box'; // Ocultar resultados previos
  if (micStatus) micStatus.textContent = "Haz clic en el micrófono y repite la palabra en Inga";

  modal.classList.add('open');
}

function cerrarModalPractica() {
  const modal = document.getElementById('practice-modal');
  if (modal) modal.classList.remove('open');

  detenerEscuchaVoz();
  AppState.currentPracticeItem = null;
}

/**
 * Inicia la captura de voz para evaluar la pronunciación del término actual en práctica.
 */
function toggleGrabacionPractica() {
  if (!SpeechRecognition) {
    alert("El reconocimiento de voz por micrófono no está soportado en este navegador. Utiliza Google Chrome o Edge.");
    return;
  }

  if (AppState.isListening) {
    detenerEscuchaVoz();
    return;
  }

  iniciarEscuchaVoz();
}

function iniciarEscuchaVoz() {
  try {
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CO'; // Base de captura fonética
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    const micBtn = document.getElementById('btn-mic-practice');
    const micStatus = document.getElementById('mic-status-text');

    recognition.onstart = () => {
      AppState.isListening = true;
      if (micBtn) micBtn.classList.add('listening');
      if (micStatus) micStatus.textContent = "🎙️ Escuchando... habla con voz clara.";
    };

    recognition.onresult = (event) => {
      const transcribido = event.results[0][0].transcript;
      console.log(`[STT Inga] Audio capturado: "${transcribido}"`);
      mostrarResultadoPractica(transcribido);
    };

    recognition.onerror = (event) => {
      console.warn("[STT Inga] Error en reconocimiento:", event.error);
      if (micStatus) micStatus.textContent = `Aviso: No se pudo capturar audio (${event.error}).`;
      detenerEscuchaVoz();
    };

    recognition.onend = () => {
      detenerEscuchaVoz();
    };

    AppState.recognitionInstance = recognition;
    recognition.start();
  } catch (err) {
    console.error("Error al arrancar SpeechRecognition:", err);
    detenerEscuchaVoz();
  }
}

function detenerEscuchaVoz() {
  AppState.isListening = false;
  const micBtn = document.getElementById('btn-mic-practice');
  if (micBtn) micBtn.classList.remove('listening');

  if (AppState.recognitionInstance) {
    try {
      AppState.recognitionInstance.abort();
    } catch (_) {}
    AppState.recognitionInstance = null;
  }
}

/**
 * Presenta el resultado del análisis fonético en la interfaz gráfica.
 */
function mostrarResultadoPractica(textoCapturado) {
  if (!AppState.currentPracticeItem) return;

  const resultado = evaluarPronunciacionPedagogica(
    textoCapturado,
    AppState.currentPracticeItem.inga
  );

  const resultBox = document.getElementById('voice-result-box');
  const scoreText = document.getElementById('accuracy-percentage');
  const barFill = document.getElementById('accuracy-bar-fill');
  const feedbackMsg = document.getElementById('feedback-message');
  const capturedDisplay = document.getElementById('recognized-transcript');

  if (!resultBox) return;

  // Actualizar contenido
  if (scoreText) scoreText.textContent = `${resultado.porcentaje}% de precisión`;
  if (feedbackMsg) feedbackMsg.textContent = resultado.mensaje;
  if (capturedDisplay) capturedDisplay.innerHTML = `Detectamos: <strong>"${textoCapturado}"</strong> | Objetivo: <strong>"${AppState.currentPracticeItem.inga}"</strong>`;

  // Asignar clase de estado visual
  resultBox.className = `voice-result-box visible accuracy-state-${resultado.estado === 'success' ? 'high' : resultado.estado === 'amber' ? 'mid' : 'low'}`;

  if (barFill) {
    barFill.style.width = `${resultado.porcentaje}%`;
  }
}

// ==============================================================================
// 7. ARQUITECTURA RAG: PROFESOR INGA VIRTUAL (CERO ALUCINACIONES)
// ==============================================================================

/**
 * Consulta determinista contra la Única Fuente de Verdad (datos.json).
 * Retorna el elemento si existe coincidencia en Inga, español o significado cultural.
 */
function consultarRegistroOficial(preguntaUsuario) {
  const query = normalizarTextoFonico(preguntaUsuario);
  if (!query) return null;

  const queryWords = query.split(/\s+/).filter(w => w.length > 2);

  let bestMatch = null;
  let highestScore = 0;

  AppState.data.forEach(item => {
    let score = 0;
    const ingaNorm = normalizarTextoFonico(item.inga);
    const espNorm = normalizarTextoFonico(item.espanol);
    const cultNorm = normalizarTextoFonico(item.significado_cultural);

    // 1. Coincidencia exacta o frase directa en Inga
    if (query === ingaNorm) {
      score += 100;
    } else if (query.includes(ingaNorm)) {
      score += 70;
    }

    // 2. Coincidencia de frases clave en español (ej. "buenos dias", "buenas noches", "buen camino")
    const frasesEspanol = espNorm.split("/").map(f => f.trim());
    for (const frase of frasesEspanol) {
      if (query.includes(frase) || frase.includes(query)) {
        score += 60;
      }
    }

    // 3. Coincidencia de palabras clave individuales
    const espWords = espNorm.split(/\s+/).filter(w => w.length > 2);
    let matchedWords = 0;
    queryWords.forEach(qw => {
      if (espWords.includes(qw)) {
        matchedWords++;
        score += 25;
      } else if (ingaNorm.split(/\s+/).includes(qw)) {
        matchedWords++;
        score += 35;
      }
    });

    // 4. Coincidencia temática cultural (con menor peso para evitar falsos positivos)
    if (query.length > 5 && cultNorm.includes(query)) {
      score += 20;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  });

  // Umbral mínimo de confianza para evitar alucinaciones
  if (highestScore >= 25 && bestMatch) {
    return bestMatch;
  }

  return null;
}

/**
 * Ejecutor del RAG: Genera la respuesta del Profesor Virtual garantizando Zero-Hallucination.
 */
function procesarPreguntaProfesor(pregunta) {
  const registro = consultarRegistroOficial(pregunta);

  // REGLA INVIOLABLE: Si no se encuentra en el registro local, devolver estrictamente la frase oficial
  if (!registro) {
    return {
      exito: false,
      mensaje: STRICT_UNREGISTERED_MESSAGE,
      registro: null
    };
  }

  // Si existe en el registro, construir respuesta pedagógica estructurada
  const respuesta = `
    <div>
      <p style="font-size: 1.05rem; font-weight: 700; color: var(--green-dark); margin-bottom: 0.3rem;">
        🌿 En Inga de Santiago se expresa: <strong>${registro.inga}</strong>
      </p>
      <p style="margin-bottom: 0.4rem;">
        <strong>Significado en español:</strong> ${registro.espanol}
      </p>
      <p style="margin-bottom: 0.4rem;">
        <strong>Pronunciación pausada:</strong> <code>${registro.pronunciacion_guia}</code>
      </p>
      <div style="background: var(--bg-surface); padding: 0.6rem; border-radius: 8px; margin-top: 0.5rem; font-size: 0.88rem; border-left: 3px solid var(--amber-primary);">
        <strong>Filosofía Suma Kaugsai:</strong> ${registro.significado_cultural}
      </div>
      <button class="bot-audio-inline" onclick="reproducirPronunciacion('${escapeHtml(registro.inga)}', '${escapeHtml(registro.pronunciacion_guia)}')">
        🔊 Escuchar pronunciación
      </button>
    </div>
  `;

  return {
    exito: true,
    mensaje: respuesta,
    registro
  };
}

/**
 * Envía el mensaje del usuario y orquesta la respuesta en la interfaz del chat.
 */
function enviarMensajeChat() {
  const input = document.getElementById('chat-user-input');
  if (!input) return;

  const texto = input.value.trim();
  if (!texto) return;

  // Renderizar mensaje del usuario
  agregarBurbujaMensaje(texto, 'user');
  input.value = '';

  // Mostrar indicador de "escribiendo"
  const typingElem = mostrarIndicadorEscribiendo();

  // Simular pequeña latencia natural de procesamiento pedagógico
  setTimeout(() => {
    removerIndicadorEscribiendo(typingElem);

    const resultadoRAG = procesarPreguntaProfesor(texto);

    if (resultadoRAG.exito) {
      agregarBurbujaMensaje(resultadoRAG.mensaje, 'bot', false);
    } else {
      // Mostrar advertencia estricta de no registro
      agregarBurbujaMensaje(resultadoRAG.mensaje, 'bot', true);
    }
  }, 450);
}

function agregarBurbujaMensaje(contenido, remitente = 'bot', esAdvertencia = false) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  const bubble = document.createElement('div');
  bubble.className = `message-bubble message-${remitente} ${esAdvertencia ? 'message-bot-notice' : ''}`;

  if (remitente === 'bot') {
    const tag = document.createElement('div');
    tag.className = 'bot-tag';
    tag.innerHTML = esAdvertencia ? '⚠️ Registro Oficial Inga' : '✨ Profesor Inga Virtual';
    bubble.appendChild(tag);

    const bodyDiv = document.createElement('div');
    bodyDiv.innerHTML = contenido;
    bubble.appendChild(bodyDiv);
  } else {
    bubble.textContent = contenido;
  }

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function mostrarIndicadorEscribiendo() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return null;

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator-node';
  indicator.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return indicator;
}

function removerIndicadorEscribiendo(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node);
  }
}

/**
 * Permite dictar una consulta al chat usando el micrófono.
 */
function activarMicrofonoChat() {
  if (!SpeechRecognition) {
    alert("Reconocimiento de voz no disponible en este navegador.");
    return;
  }

  const btnMic = document.getElementById('btn-chat-mic');
  const input = document.getElementById('chat-user-input');

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-CO';
  recognition.interimResults = false;

  recognition.onstart = () => {
    if (btnMic) btnMic.classList.add('listening');
    if (input) input.placeholder = "Escuchando tu pregunta...";
  };

  recognition.onresult = (event) => {
    const texto = event.results[0][0].transcript;
    if (input) {
      input.value = texto;
      enviarMensajeChat();
    }
  };

  recognition.onend = () => {
    if (btnMic) btnMic.classList.remove('listening');
    if (input) input.placeholder = "Pregunta en español o Inga (ej. ¿Qué significa Suma puncha?)...";
  };

  recognition.onerror = () => {
    if (btnMic) btnMic.classList.remove('listening');
  };

  recognition.start();
}

// ==============================================================================
// 8. EVENT LISTENERS Y CONFIGURACIÓN AL CARGAR LA PÁGINA
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Carga inicial asíncrona de datos
  cargarBaseDeDatos();

  // 2. Control de Pestañas Principales (Aprender vs Profesor Virtual)
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const targetView = button.dataset.view;

      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

      button.classList.add('active');
      const activePanel = document.getElementById(targetView);
      if (activePanel) activePanel.classList.add('active');
    });
  });

  // 3. Filtros de Categoría
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      AppState.activeCategory = pill.dataset.category;
      renderizarTarjetas();
    });
  });

  // 4. Barra de búsqueda en vivo
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      renderizarTarjetas();
    });
  }

  // 5. Envío en el Chat
  const chatInput = document.getElementById('chat-user-input');
  const btnSend = document.getElementById('btn-chat-send');
  const btnChatMic = document.getElementById('btn-chat-mic');

  if (btnSend) {
    btnSend.addEventListener('click', enviarMensajeChat);
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        enviarMensajeChat();
      }
    });
  }

  if (btnChatMic) {
    btnChatMic.addEventListener('click', activarMicrofonoChat);
  }

  // 6. Chips de preguntas sugeridas
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const texto = chip.textContent.trim().replace(/^"|"$/g, '');
      if (chatInput) {
        chatInput.value = texto;
        enviarMensajeChat();
      }
    });
  });

  // 7. Modal de práctica
  const btnCloseModal = document.getElementById('btn-modal-close');
  const btnMicPractice = document.getElementById('btn-mic-practice');
  const modalOverlay = document.getElementById('practice-modal');

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', cerrarModalPractica);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        cerrarModalPractica();
      }
    });
  }

  if (btnMicPractice) {
    btnMicPractice.addEventListener('click', toggleGrabacionPractica);
  }
});

// Utilidad auxiliar para escapar strings en onclick inline
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}
