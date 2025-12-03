-- ==========================================================
-- 1. CONFIGURACIÓN INICIAL Y LIMPIEZA
-- ==========================================================
DROP DATABASE IF EXISTS rover_iot_db;
CREATE DATABASE rover_iot_db;
USE rover_iot_db;

-- ==========================================================
-- 2. CREACIÓN DE TABLAS (ESTRUCTURA DE DATOS)
-- ==========================================================

-- A. Tabla de ESTADO ACTUAL (El cerebro)
-- Solo tendrá una fila. La web consulta aquí para saber si el auto está ocupado o libre.
CREATE TABLE estado_rover (
    id INT PRIMARY KEY,
    modo_operacion ENUM('MANUAL', 'AUTO') DEFAULT 'MANUAL',
    estado_conexion ENUM('ONLINE', 'OFFLINE') DEFAULT 'OFFLINE',
    ultimo_comando VARCHAR(50) DEFAULT 'STOP',
    ultima_actividad DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- B. Tabla de HISTORIAL DE COMANDOS (La caja negra)
-- Registra cada botón que se presiona o decisión del modo automático.
CREATE TABLE historial_comandos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    comando VARCHAR(50) NOT NULL,
    origen VARCHAR(20) NOT NULL, -- 'WEB_USER', 'AUTO_SYSTEM'
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- C. Tabla de DATOS DE SENSORES (Telemetría)
-- Para guardar lo que ve el sensor ultrasónico (útil para gráficas futuras).
CREATE TABLE historial_sensores (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    distancia_cm DECIMAL(10,2),
    detecto_obstaculo BOOLEAN DEFAULT FALSE,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- D. Tablas para DEMOS (Secuencias grabadas)
-- D1. Encabezado de la Demo
CREATE TABLE demos_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_demo VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- D2. Pasos de la Demo
CREATE TABLE demos_pasos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    demo_id INT NOT NULL,
    comando VARCHAR(50) NOT NULL,
    duracion_ms INT NOT NULL DEFAULT 1000, -- Tiempo en milisegundos
    orden_secuencia INT NOT NULL,
    FOREIGN KEY (demo_id) REFERENCES demos_config(id) ON DELETE CASCADE
);

-- ==========================================================
-- 3. PROCEDIMIENTOS ALMACENADOS (LÓGICA DE NEGOCIO)
-- ==========================================================

DELIMITER //

-- SP 1: Registrar comando y actualizar estado (Todo en uno)
-- Este es el que más usará tu API.
CREATE PROCEDURE sp_ejecutar_comando(
    IN p_comando VARCHAR(50),
    IN p_origen VARCHAR(20)
)
BEGIN
    -- 1. Guardar en historial
    INSERT INTO historial_comandos (comando, origen) VALUES (p_comando, p_origen);
    
    -- 2. Actualizar el estado actual del rover
    UPDATE estado_rover 
    SET ultimo_comando = p_comando, 
        ultima_actividad = NOW() 
    WHERE id = 1;
END //

-- SP 2: Cambiar Modo (Manual <-> Auto)
CREATE PROCEDURE sp_cambiar_modo(
    IN p_nuevo_modo VARCHAR(10)
)
BEGIN
    UPDATE estado_rover 
    SET modo_operacion = p_nuevo_modo,
        ultimo_comando = 'STOP', -- Por seguridad, al cambiar modo frenamos
        ultima_actividad = NOW()
    WHERE id = 1;
END //

-- SP 3: Guardar lectura del sensor ultrasónico
CREATE PROCEDURE sp_registrar_sensor(
    IN p_distancia DECIMAL(10,2),
    IN p_obstaculo BOOLEAN
)
BEGIN
    INSERT INTO historial_sensores (distancia_cm, detecto_obstaculo)
    VALUES (p_distancia, p_obstaculo);
END //

-- SP 4: Crear nueva Demo (Devuelve el ID para insertar pasos)
CREATE PROCEDURE sp_crear_demo_header(
    IN p_nombre VARCHAR(100),
    IN p_descripcion VARCHAR(255),
    OUT p_id_generado INT
)
BEGIN
    INSERT INTO demos_config (nombre_demo, descripcion) VALUES (p_nombre, p_descripcion);
    SET p_id_generado = LAST_INSERT_ID();
END //

-- SP 5: Agregar paso a una Demo
CREATE PROCEDURE sp_agregar_paso_demo(
    IN p_demo_id INT,
    IN p_comando VARCHAR(50),
    IN p_duracion INT,
    IN p_orden INT
)
BEGIN
    INSERT INTO demos_pasos (demo_id, comando, duracion_ms, orden_secuencia)
    VALUES (p_demo_id, p_comando, p_duracion, p_orden);
END //

-- SP 6: Obtener Dashboard completo
-- Devuelve el estado actual + los ultimos 5 movimientos en una sola llamada
-- Nota: Este devuelve dos result sets, tu Python manejará eso fácil.
CREATE PROCEDURE sp_obtener_dashboard()
BEGIN
    -- Resultado 1: Estado
    SELECT * FROM estado_rover WHERE id = 1;
    
    -- Resultado 2: Últimos 10 comandos
    SELECT comando, origen, DATE_FORMAT(fecha_hora, '%H:%i:%s') as hora 
    FROM historial_comandos 
    ORDER BY id DESC LIMIT 10;
END //

DELIMITER ;

-- ==========================================================
-- 4. INICIALIZACIÓN DE DATOS (BOOTSTRAP)
-- ==========================================================

-- Insertamos el estado inicial para que la tabla no esté vacía
INSERT INTO estado_rover (id, modo_operacion, estado_conexion, ultimo_comando)
VALUES (1, 'MANUAL', 'ONLINE', 'STOP');

-- Insertamos una Demo de prueba
INSERT INTO demos_config (id, nombre_demo, descripcion) VALUES (1, 'Baile Basico', 'Izquierda y Derecha');
INSERT INTO demos_pasos (demo_id, comando, duracion_ms, orden_secuencia) VALUES 
(1, 'IZQUIERDA', 1000, 1),
(1, 'DERECHA', 1000, 2),
(1, 'STOP', 500, 3);


SELECT * FROM demos_config;