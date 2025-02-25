// Asegúrate de que pdfjsLib esté cargado antes de usarlo
if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js library is not loaded');
    throw new Error('PDF.js library is not loaded');
}

const pdfUrl = 'documents/Carta NAZCA-corregida.pdf';
const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

const pagesToLoad = 1; // Reducido para una carga más rápida inicial
let pdfDocument = null;
let currentPageNumber = 1;
let isLoadingPdf = false;
const pageCache = new Map();
let observer = null;
let endMarker = document.createElement('span'); // Cambia 'div' por 'span'

async function renderPage(pageNumber) {
    if (!pdfDocument || pageNumber > pdfDocument.numPages) return;

    const page = await pdfDocument.getPage(pageNumber);
    const scaleFactor = window.devicePixelRatio || 1;
    const scale = (pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width) * scaleFactor;
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
    endMarker = document.createElement('span'); // Cambia 'div' por 'span'
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

        window.addEventListener('resize', debounce(() => {
            pageCache.clear();
            pdfContainer.innerHTML = '';
            currentPageNumber = 1;
            loadNextPages();
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