# Mockups — Lector Audio

Fuente: lienzo de Claude Design *Lector Audio - Mockups* (export empaquetado en
[`Lector Audio - Mockups.html`](Lector%20Audio%20-%20Mockups.html), se abre en el
navegador). Este archivo resume las decisiones para poder revisarlas sin abrir el
HTML.

> Estado: **exploración**. La turn 1 propone **tres direcciones de layout** (1a,
> 1b, 1c); todavía no hay una elegida. Las notas de iteración están al final.

## Controles de diseño (props del lienzo)

| Prop          | Tipo    | Por defecto | Opciones                                             | Sección            |
| ------------- | ------- | ----------- | --------------------------------------------------- | ------------------ |
| `accent`      | color   | `#0f5c58`   | `#0f5c58` teal · `#2b4c8c` azul · `#7a3b8f` morado · `#1c1a17` tinta | Tema |
| `highlight`   | color   | `#f6d78a`   | `#f6d78a` ámbar · `#bfe3dd` menta · `#e8d4f0` lila · `#ffd0b8` melocotón | Tema |
| `showNumbers` | boolean | `true`      | —                                                   | Lista de párrafos  |

## Tipografía

- **Atkinson Hyperlegible** — texto de lectura (los párrafos del documento).
  Diseñada para baja visión; encaja con el enfoque accesible de la app.
- **Public Sans** — todo el *chrome* de interfaz.

## Paleta

| Rol                      | Color                                   |
| ------------------------ | --------------------------------------- |
| Fondo ventana            | `#e9e4da` (papel cálido)                |
| Superficie / tarjeta     | `#fffdf9`                               |
| Tinta                    | `#1c1a17`                               |
| Texto atenuado           | `#6b6459` · `#8a8175` · `#b3aa9c`       |
| Acento (teal)            | `#0f5c58`, hover `#0a3e3b`              |
| Aviso (OCR / Readability)| fondo `#fdf3d8` · marca `#c98a12` · tinta `#5f4b18` |
| Error / sin conexión     | fondo `#fbe4e0` · marca `#c0392b` · tinta `#7a2b20` |
| OCR en progreso          | fondo `#eef4f3` · acento `#0f5c58`      |
| Modo enfoque (lectura)   | fondo `#221f1b`                         |

## Elementos comunes a las tres direcciones

Implementan el brief §5.7 (una sola ventana):

- Lista de párrafos con **párrafo activo resaltado** y **clic para saltar**.
- Transporte: anterior / play-pausa / siguiente (1a añade stop).
- «Párrafo x de y» + barra de progreso.
- Selector de motor: **Sistema (offline)** / **ElevenLabs** / **OpenAI TTS**.
- Selector de voz (voces por motor).
- Velocidad 0.5–2.0.

## 1a · Tres paneles clásico · macOS · barra expandida (1140 px)

- Barra de título estilo macOS (semáforo, nombre de archivo centrado).
- **Panel izquierdo (entrada, 280 px):** textarea «Pega aquí tu texto…», botón
  «Abrir PDF / HTML», campo URL + «Leer», zona de *drag & drop*, contadores de
  sesión (caracteres a la API, tamaño de caché), botón «Ajustes…».
- **Panel central:** banner de aviso descartable («Páginas 3–7 procesadas con
  OCR…»), título + metadatos del documento, lista de párrafos con numeración
  monoespaciada y resaltado del activo (highlight al 40 % + borde izquierdo en
  acento).
- **Barra inferior expandida:** transporte con botón de play grande (56 px),
  progreso, selectores de motor y voz, slider de velocidad.
- **Modal de ajustes:** API key ElevenLabs (con nota «Cifrada en disco con
  safeStorage. Nunca sale del proceso principal.»), API key OpenAI, idioma OCR
  (spa / spa+eng), tamaño de chunk (3000), caché de audio (tamaño + nº de chunks)
  + «Vaciar».

## 1b · Denso · Windows · barra compacta en cabecera (1000 px)

- *Chrome* de Windows (barra oscura, botón de cerrar rojo).
- **Transporte compacto dentro de la barra superior** + botón «Exportar MP3».
- **Estado sin conexión:** banner de error con acción «Usar motor del sistema»
  (brief §6: sugerir el motor local cuando falla el remoto).
- **OCR en progreso:** franja «OCR en curso · página 7 de 42» + barra al 17 % +
  «Ya puedes escuchar lo procesado» + «Cancelar» (brief §6: OCR progresivo, se
  empieza a escuchar lo ya procesado).
- **Panel izquierdo (220 px):** pestañas Documento / Entrada, cuadrícula de
  páginas coloreada según estado de OCR, contadores.
- Cada fila de párrafo lleva una **etiqueta de origen** («pág. 1 · texto» vs
  «pág. 3 · OCR» en ámbar).

## 1c · Enfoque lectura · panel único · tipografía grande (820 px)

- Toggle «Modo enfoque».
- Superficie de lectura **oscura** con enfoque activo; los párrafos no activos se
  **atenúan** (opacidad 0.62).
- Tipografía de lectura grande, **3 tamaños** (A / A / A).
- Velocidad como *chips* (0.8× · 1× · 1.3× · 1.6×).
- Transporte centrado mínimo (play de 72 px).

## Notas de iteración (del propio lienzo)

- «Quédate con **1a** pero con la barra compacta de **1b**.»
- «Lleva el resaltado por palabra de **1c** a todas.»
  (Ojo: el brief limita el resaltado por palabra al motor local; el remoto va por
  párrafo.)
- «Añade el estado vacío y el *drag & drop*.»
