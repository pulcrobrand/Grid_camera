/* © 2026, Rommina Dolorier todos los derechos reservados.
"Creado para OFF, Chelas y código creativo"

–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
*/
// CONTROLES: cambia estos valores y vuelve a ejecutar el sketch.
// Espacio horizontal en píxeles entre los bordes visibles de las letras.
// Usa 0 para que se toquen; por ejemplo, 12 para separarlas.
let espaciadoLetras = 0;

// De 0 (retícula uniforme, sin efecto de la mano) a 1 (estiramiento dramático).
// Prueba 0.25 para un efecto sutil o 0.65 para uno más marcado.
let intensidadEstirado = 0.95;

const pasoReticula = 200; // Conserva la densidad de la retícula original.
const tamanoFuente = 200;
const suavizadoManoMs = 30;
let tipografia;
let limitesLetra;
let columnas;
let filas;
let palmaX = 0.5;
let palmaY = 0.5;
let manoSuaveX = 0.5;
let manoSuaveY = 0.5;
let modeloManos;
let modeloListo = false;
let camara;
let deteccionEnCurso = false;
let ultimoFotograma = -1;

function preload() {
  tipografia = loadFont('assets/ABCCameraTrial-RegularItalic.otf');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont(tipografia);
  textSize(tamanoFuente);
  textAlign(LEFT, BASELINE);
  noStroke();

  // Medimos el contorno real para eliminar los márgenes propios de la fuente.
  limitesLetra = tipografia.textBounds('a', 0, 0, tamanoFuente);
  ajustarReticula();

  modeloManos = ml5.handPose({
    modelType: 'lite',
    runtime: 'mediapipe',
    maxHands: 1,
    flipHorizontal: false // El espejo se aplica una sola vez al centro de la palma.
  }, () => {
    modeloListo = true;
  });
  iniciarCamara();
}

function draw() {
  background('#000000');
  fill('#FFFFFF');

  detectarMano();

  // Respuesta de 30 ms independiente de la velocidad de fotogramas.
  // El mismo suavizado devuelve la retícula al centro cuando no hay mano.
  const suavizado = 1 - Math.exp(-max(0, deltaTime) / suavizadoManoMs);
  manoSuaveX = lerp(manoSuaveX, palmaX, suavizado);
  manoSuaveY = lerp(manoSuaveY, palmaY, suavizado);

  // Si no cabe el espacio solicitado, se limita para mantener letras visibles.
  const espacio = columnas > 1
    ? constrain(espaciadoLetras, 0, (width - columnas) / (columnas - 1))
    : 0;
  const anchoLetras = width - espacio * (columnas - 1);
  const anchos = repartirMedidas(columnas, anchoLetras, manoSuaveX);
  const altos = repartirMedidas(filas, height, manoSuaveY);

  let y = 0;
  for (let fila = 0; fila < filas; fila++) {
    let x = 0;
    for (let columna = 0; columna < columnas; columna++) {
      push();
      translate(x, y);
      scale(anchos[columna] / limitesLetra.w, altos[fila] / limitesLetra.h);
      text('a', -limitesLetra.x, -limitesLetra.y);
      pop();
      x += anchos[columna] + espacio;
    }
    y += altos[fila];
  }
}

async function iniciarCamara() {
  camara = document.createElement('video');
  camara.id = 'preview-camara';
  camara.autoplay = true;
  camara.muted = true;
  camara.playsInline = true;
  camara.hidden = true;
  document.body.appendChild(camara);

  camara.addEventListener('loadeddata', () => {
    camara.hidden = false;
  });
  camara.addEventListener('pause', centrarPalma);
  camara.addEventListener('emptied', centrarPalma);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    for (const pista of stream.getVideoTracks()) {
      pista.addEventListener('ended', () => {
        camara.hidden = true;
        centrarPalma();
      });
    }
    window.addEventListener('pagehide', () => {
      stream.getTracks().forEach(pista => pista.stop());
    }, { once: true });
    camara.srcObject = stream;
    await camara.play();
  } catch (error) {
    camara.hidden = true;
    centrarPalma();
    console.warn('No se pudo iniciar la cámara:', error);
  }
}

async function detectarMano() {
  if (!camara || camara.readyState < 2 || camara.paused || camara.ended) {
    centrarPalma();
    return;
  }

  // Una sola inferencia a la vez. Se omiten los fotogramas intermedios:
  // al terminar se procesa el video actual, sin crear una cola de imágenes.
  if (!modeloListo || deteccionEnCurso || camara.currentTime === ultimoFotograma) {
    return;
  }

  deteccionEnCurso = true;
  ultimoFotograma = camara.currentTime;
  try {
    const manos = await modeloManos.detect(camara);
    if (camara.paused || camara.ended || camara.hidden) {
      centrarPalma();
    } else {
      actualizarPalma(manos);
    }
  } catch (error) {
    modeloListo = false;
    centrarPalma();
    console.warn('No se pudo detectar la mano:', error);
  } finally {
    deteccionEnCurso = false;
  }
}

function actualizarPalma(manos) {
  const puntos = manos[0]?.keypoints;
  // Muñeca y bases de los cuatro dedos: el centro no depende de las puntas.
  const indicesPalma = [0, 5, 9, 13, 17];
  if (!puntos || !indicesPalma.every(i =>
    Number.isFinite(puntos[i]?.x) && Number.isFinite(puntos[i]?.y))) {
    centrarPalma();
    return;
  }

  const centroX = indicesPalma.reduce((suma, i) => suma + puntos[i].x, 0) / indicesPalma.length;
  const centroY = indicesPalma.reduce((suma, i) => suma + puntos[i].y, 0) / indicesPalma.length;
  // Coincide con el preview en espejo, conservando las dimensiones del video.
  palmaX = constrain(1 - centroX / camara.videoWidth, 0, 1);
  palmaY = constrain(centroY / camara.videoHeight, 0, 1);
}

function centrarPalma() {
  palmaX = 0.5;
  palmaY = 0.5;
}

function repartirMedidas(cantidad, total, posicionMano) {
  const intensidad = constrain(intensidadEstirado, 0, 1);
  const direccion = posicionMano * 2 - 1;
  const pesos = [];
  let suma = 0;

  // Hacia la derecha/abajo crecen las últimas columnas/filas;
  // hacia la izquierda/arriba crecen las primeras. En el centro se igualan.
  for (let i = 0; i < cantidad; i++) {
    const posicion = ((i + 0.5) / cantidad) * 2 - 1;
    const peso = Math.exp(posicion * direccion * intensidad * 2.5);
    pesos.push(peso);
    suma += peso;
  }

  // Normalizar mantiene la suma de anchos/altos ajustada al canvas.
  return pesos.map(peso => total * peso / suma);
}

function ajustarReticula() {
  columnas = max(1, ceil(width / pasoReticula));
  filas = max(1, ceil(height / pasoReticula));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  ajustarReticula();
}
