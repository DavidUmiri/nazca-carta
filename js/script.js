// Verifica que PDF.js esté cargado
if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js library is not loaded');
    throw new Error('PDF.js library is not loaded');
}

// Función para detectar dispositivos móviles
function isMobile() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const pdfUrl = 'documents/Carta NAZCA-corregida.pdf';
const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

const pagesToLoad = 1; // Carga una página a la vez para acelerar la carga inicial
let pdfDocument = null;
let currentPageNumber = 1;
let isLoadingPdf = false;
const pageCache = new Map();
let observer = null;
let endMarker = document.createElement('span'); // Usamos un <span> como marcador

async function renderPage(pageNumber) {
    if (!pdfDocument || pageNumber > pdfDocument.numPages) return;

    const page = await pdfDocument.getPage(pageNumber);
    // En móviles forzamos una escala reducida (0.5) para mejorar el rendimiento
    const scaleFactor = isMobile() ? 0.5 : (window.devicePixelRatio || 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (pdfContainer.clientWidth / baseViewport.width) * scaleFactor;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-page-number', pageNumber);
    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / scaleFactor}px`;
    canvas.style.height = `${viewport.height / scaleFactor}px`;

    const renderContext = {
        canvasContext: context,
        viewport,
        intent: 'display'
    };

    await page.render(renderContext).promise;
    return canvas;
}

async function loadPage(pageNumber) {
    if (pageCache.has(pageNumber)) {
        const cachedCanvas = pageCache.get(pageNumber);
        if (!pdfContainer.contains(cachedCanvas)) {
            pdfContainer.appendChild(cachedCanvas);
        }
        return;
    }

    const canvas = await renderPage(pageNumber);
    pageCache.set(pageNumber, canvas);
    pdfContainer.appendChild(canvas);
}

async function loadNextPages() {
    if (isLoadingPdf || currentPageNumber > pdfDocument.numPages) return;
    isLoadingPdf = true;

    try {
        const pagesToRender = Math.min(pagesToLoad, pdfDocument.numPages - currentPageNumber + 1);
        const pagePromises = Array.from({ length: pagesToRender }, (_, i) =>
            loadPage(currentPageNumber + i)
        );

        await Promise.all(pagePromises);
        currentPageNumber += pagesToRender;

        if (currentPageNumber <= pdfDocument.numPages) {
            updateEndMarker();
        }
    } catch (error) {
        console.error('Error al cargar las páginas:', error);
    } finally {
        isLoadingPdf = false;
    }
}

function updateEndMarker() {
    if (endMarker.parentNode) {
        endMarker.remove();
    }
    endMarker = document.createElement('span');
    endMarker.id = 'pdf-end-marker';
    pdfContainer.appendChild(endMarker);

    if (observer) {
        observer.disconnect();
    }

    observer = new IntersectionObserver(entries => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting && !isLoadingPdf) {
            loadNextPages();
        }
    }, { root: null, rootMargin: '5000px', threshold: 0.01 });

    observer.observe(endMarker);
}

async function loadPdf() {
    try {
        pdfDocument = await pdfjsLib.getDocument(pdfUrl).promise;
        await loadNextPages();

        // Evita recargar el PDF por cambios mínimos de tamaño en móviles
        let lastWidth = pdfContainer.clientWidth;
        window.addEventListener('resize', debounce(() => {
            const newWidth = pdfContainer.clientWidth;
            if (Math.abs(newWidth - lastWidth) > 50) { // Solo recarga si hay un cambio significativo
                pageCache.clear();
                pdfContainer.innerHTML = '';
                currentPageNumber = 1;
                loadNextPages();
                lastWidth = newWidth;
            }
        }, 300));

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.addEventListener("DOMContentLoaded", loadPdf);
