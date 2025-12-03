// =================================================
// 1. CONFIGURACIÓN GLOBAL
// =================================================
const AWS_IP = "34.234.8.189"; // <--- ¡TU IP!
const AWS_PORT = "8000";

let socket;
let isRecording = false;
let recordedSteps = [];
let lastTime = 0;
let lastCommand = "STOP";
let modalInstancia = null; 

// Referencias HTML
const statusDiv = document.getElementById('connection-status');
const consoleDiv = document.getElementById('console-log');
const lastCmdDiv = document.getElementById('last-cmd');
const sensorDiv = document.getElementById('sensor-dist');

// =================================================
// 2. CONEXIÓN WEBSOCKET
// =================================================
function conectarWS() {
    socket = new WebSocket(`ws://${AWS_IP}:${AWS_PORT}/ws/web`);

    socket.onopen = function(e) {
        if(statusDiv) {
            statusDiv.innerHTML = "🟢 CONECTADO A AWS";
            statusDiv.className = "text-center mb-3 text-success";
        }
        log("Sistema Online. Conexión establecida.");
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if((data.status === "ok" || data.status === "ejecutando_paso") && lastCmdDiv) {
            if(data.ultimo_comando) lastCmdDiv.innerText = data.ultimo_comando;
            if(data.comando) lastCmdDiv.innerText = data.comando;
        }
        
        if(data.tipo === "sensor" && sensorDiv) {
            let valor = parseFloat(data.valor).toFixed(1);
            sensorDiv.innerText = valor + " cm";

            if (valor < 20) {
                sensorDiv.style.color = "#ff0055"; 
                sensorDiv.style.textShadow = "0 0 15px #ff0055";
            } else if (valor < 50) {
                sensorDiv.style.color = "#ff9800"; 
                sensorDiv.style.textShadow = "0 0 10px #ff9800";
            } else {
                sensorDiv.style.color = "#00d4ff"; 
                sensorDiv.style.textShadow = "0 0 10px #00d4ff";
            }
        }

        if(data.status === "demo_guardada") alert(data.mensaje);
        if(data.status === "demo_finalizada") alert("Secuencia finalizada.");
    };

    socket.onclose = function(event) {
        if(statusDiv) {
            statusDiv.innerHTML = "🔴 DESCONECTADO - Reintentando...";
            statusDiv.className = "text-center mb-3 text-danger";
        }
        setTimeout(conectarWS, 3000);
    };
}

window.onload = function() {
    conectarWS();
    if(document.getElementById('demos-list')) {
        cargarDemosGuardadas();
    }
};

// =================================================
// 3. FUNCIONES DE CONTROL
// =================================================
let enviarComando = function(comando) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { accion: "mover", comando: comando };
        socket.send(JSON.stringify(payload));
        if (isRecording) registrarPasoEnGrabadora(comando);
    } else {
        console.error("No hay conexión");
    }
};

function cambiarModo() {
    const isAuto = document.getElementById('modoSwitch').checked;
    const modoTexto = document.getElementById('modo-texto');
    
    if(isAuto) {
        modoTexto.innerText = "Estado: AUTOMÁTICO";
        modoTexto.className = "mt-2 text-warning";
        if (socket) socket.send(JSON.stringify({ accion: "mover", comando: "AUTO" }));
    } else {
        modoTexto.innerText = "Estado: MANUAL";
        modoTexto.className = "mt-2 text-info";
        if (socket) socket.send(JSON.stringify({ accion: "mover", comando: "MANUAL" }));
    }
}

// =================================================
// 4. GRABADORA Y DEMOS
// =================================================
function iniciarGrabacion() {
    isRecording = true;
    recordedSteps = [];
    lastTime = Date.now();
    lastCommand = "STOP";
    
    document.getElementById('btn-rec').style.display = 'none';
    document.getElementById('save-controls').style.display = 'block';
    document.getElementById('rec-status').innerText = "Estado: GRABANDO [0 pasos]";
    
    alert("Grabación Iniciada. Usa los botones de abajo.");
}

function registrarPasoEnGrabadora(comandoActual) {
    const now = Date.now();
    const duracion = now - lastTime;
    if (duracion > 50) { 
        recordedSteps.push({ cmd: lastCommand, time: duracion });
        document.getElementById('rec-status').innerText = `Estado: GRABANDO [${recordedSteps.length} pasos]`;
    }
    lastTime = now;
    lastCommand = comandoActual;
}

function detenerGrabacion() {
    isRecording = false;
    const now = Date.now();
    recordedSteps.push({ cmd: lastCommand, time: now - lastTime });
    recordedSteps.push({ cmd: "STOP", time: 500 });

    const modalEl = document.getElementById('nameModal');
    modalInstancia = new bootstrap.Modal(modalEl);
    modalInstancia.show();
    setTimeout(() => document.getElementById('demoNameInput').focus(), 500);
}

function confirmarGuardado() {
    const nombreInput = document.getElementById('demoNameInput');
    const nombre = nombreInput.value;
    if(!nombre) return alert("Escribe un nombre");

    socket.send(JSON.stringify({
        accion: "guardar_demo",
        nombre: nombre,
        pasos: recordedSteps
    }));
    
    document.getElementById('btn-rec').style.display = 'block';
    document.getElementById('save-controls').style.display = 'none';
    if(modalInstancia) modalInstancia.hide();
    nombreInput.value = ""; 
    
    setTimeout(cargarDemosGuardadas, 500); 
}

function ejecutarDemo(nombre) {
    socket.send(JSON.stringify({ accion: "ejecutar_demo", nombre: nombre }));
    alert("Iniciando secuencia: " + nombre);
}

async function cargarDemosGuardadas() {
    try {
        const response = await fetch(`http://${AWS_IP}:${AWS_PORT}/api/dashboard`);
        const data = await response.json();

        if (data.demos) {
            const lista = document.getElementById('demos-list');
            if(lista) {
                lista.innerHTML = ""; 
                data.demos.forEach(demo => {
                    const nombre = demo.nombre_demo;
                    lista.innerHTML += `<button class="btn btn-outline-light p-3 mt-2 demo-btn" onclick="ejecutarDemo('${nombre}')">▶ <strong>${nombre}</strong></button>`;
                });
            }
        }
    } catch (error) {
        console.error("Error cargando demos:", error);
    }
}

// LÓGICA ACTUALIZADA SIN VELOCIDAD BAJA
function setVelocidad(modo) {
    if(!document.getElementById('btn-mid')) return; // Seguridad si no existen botones

    // Quitamos 'active' de los que quedan
    document.getElementById('btn-mid').classList.remove('active');
    document.getElementById('btn-high').classList.remove('active');
    
    let desc = "";
    if(modo === 'MID') {
        document.getElementById('btn-mid').classList.add('active');
        desc = "Modo Normal: Equilibrio.";
    } else {
        document.getElementById('btn-high').classList.add('active');
        desc = "Modo Turbo: Giros rápidos.";
    }
    document.getElementById('vel-desc').innerText = desc;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ accion: "velocidad", modo: modo }));
    }
}

function log(texto) {
    if(consoleDiv) {
        const div = document.createElement('div');
        div.innerText = `> ${texto}`;
        consoleDiv.prepend(div);
    }
}