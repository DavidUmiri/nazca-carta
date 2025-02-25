const pdfUrl = 'documents/Carta NAZCA-corregida.pdf';
const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

// Configuración optimizada
const pagesToLoad = 3; // Reducido para mayor rendimiento
let pdfDocument = null;
let currentPageNumber = 1;
let isLoadingPdf = false;
const renderedPages = new Set(); // Registro de páginas ya renderizadas
const canvasPool = new Map();
let observer = null;
let endMarker = document.createElement('div');
let pageGap = 10; // Espacio entre páginas en px
let preloadDistance = 500; // Distancia en px para cargar antes de llegar al final

// Elemento indicador de carga
const loadingIndicator = document.createElement('div');
loadingIndicator.className = 'pdf-loading-indicator';
loadingIndicator.innerHTML = '<div class="spinner"></div><span>Cargando páginas...</span>';
loadingIndicator.style.display = 'none';
loadingIndicator.style.position = 'fixed';
loadingIndicator.style.bottom = '20px';
loadingIndicator.style.right = '20px';
loadingIndicator.style.background = 'rgba(0, 0, 0, 0.7)';
loadingIndicator.style.color = 'white';
loadingIndicator.style.padding = '10px 15px';
loadingIndicator.style.borderRadius = '5px';
loadingIndicator.style.zIndex = '1000';
loadingIndicator.style.display = 'flex';
loadingIndicator.style.alignItems = 'center';
loadingIndicator.style.gap = '10px';
document.body.appendChild(loadingIndicator);

// Estilos para el spinner
const style = document.createElement('style');
style.textContent = `
.spinner {
    width: 18px;
    height: 18px;
    border: 3px solid transparent;
    border-top: 3px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.pdf-page-container {
    margin-bottom: ${pageGap}px;
    background: #f5f5f5;
    position: relative;
}
.pdf-page-placeholder {
    background: #f0f0f0;
    border: 1px solid #ddd;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    font-size: 14px;
}
`;
document.head.appendChild(style);

function getCanvas(pageNumber) {
    if (canvasPool.has(pageNumber)) {
        return canvasPool.get(pageNumber);
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-page-number', pageNumber);
    canvasPool.set(pageNumber, canvas);
    return canvas;
}

// Función para crear placeholders para pre-dimensionar el espacio
async function createPagePlaceholders(numPages) {
    for (let i = 1; i <= numPages; i++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.id = `page-container-${i}`;
        pageContainer.setAttribute('data-page-number', i);
        
        // Dimensiones iniciales aproximadas
        const initialHeight = 800; // Altura aproximada inicial
        pageContainer.style.height = `${initialHeight}px`;
        
        // Agregar un placeholder visual
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page-placeholder';
        placeholder.style.width = '100%';
        placeholder.style.height = '100%';
        placeholder.textContent = `Cargando página ${i}...`;
        pageContainer.appendChild(placeholder);
        
        pdfContainer.appendChild(pageContainer);
        
        // Configurar observador para cada página
        const pageObserver = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !renderedPages.has(i)) {
                loadPage(i);
            }
        }, { rootMargin: `${preloadDistance}px` });
        
        pageObserver.observe(pageContainer);
    }
}

async function loadPage(pageNumber) {
    if (!pdfDocument || pageNumber > pdfDocument.numPages || renderedPages.has(pageNumber)) return;
    
    try {
        const page = await pdfDocument.getPage(pageNumber);
        const scaleFactor = window.devicePixelRatio || 1;
        const scale = (pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width);
        const viewport = page.getViewport({ scale });

        const pageContainer = document.getElementById(`page-container-${pageNumber}`);
        if (!pageContainer) return;
        
        // Limpiar el contenedor
        pageContainer.innerHTML = '';
        
        // Ajustar altura exacta
        pageContainer.style.height = `${viewport.height / scaleFactor}px`;

        const canvas = getCanvas(pageNumber);
        pageContainer.appendChild(canvas);

        const context = canvas.getContext('2d', { alpha: false });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / scaleFactor}px`;
        canvas.style.height = `${viewport.height / scaleFactor}px`;

        // Mostrar indicador de carga
        loadingIndicator.style.display = 'flex';
        
        await page.render({
            canvasContext: context,
            viewport,
            intent: 'display'
        }).promise;

        // Marcar la página como renderizada
        renderedPages.add(pageNumber);
        
        // Si todas las páginas visibles están cargadas, ocultar indicador
        if (document.querySelectorAll('.pdf-page-placeholder').length === 0) {
            loadingIndicator.style.display = 'none';
        }
    } catch (error) {
        console.error(`Error al renderizar la página ${pageNumber}:`, error);
    }
}

async function loadVisiblePages() {
    // Esta función se llamará cuando el usuario haga scroll
    const viewportHeight = window.innerHeight;
    const scrollTop = window.scrollY;
    const buffer = viewportHeight * 1.5; // Buffer para cargar antes/después
    
    if (isLoadingPdf) return;
    
    const pageContainers = document.querySelectorAll('.pdf-page-container');
    let anyLoading = false;
    
    for (const container of pageContainers) {
        const rect = container.getBoundingClientRect();
        const pageNumber = parseInt(container.getAttribute('data-page-number'));
        
        // Si la página está visible o cerca de serlo
        if (rect.top < viewportHeight + buffer && rect.bottom > -buffer) {
            if (!renderedPages.has(pageNumber)) {
                anyLoading = true;
                loadPage(pageNumber);
            }
        }
    }
    
    loadingIndicator.style.display = anyLoading ? 'flex' : 'none';
}

async function loadPdf() {
    try {
        // Mostrar indicador al iniciar la carga
        loadingIndicator.style.display = 'flex';
        loadingIndicator.querySelector('span').textContent = 'Cargando PDF...';
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        
        // Modificación aquí para evitar mostrar 101%
        loadingTask.onProgress = function(progress) {
            if (progress.total) {
                // Limitar el porcentaje máximo a 100%
                const percent = Math.min(100, (progress.loaded / progress.total * 100));
                loadingIndicator.querySelector('span').textContent = 
                    `Cargando PDF... ${Math.round(percent)}%`;
            } else {
                // Si no hay total, simplemente mostrar que está cargando
                loadingIndicator.querySelector('span').textContent = 'Cargando PDF...';
            }
        };
        
        pdfDocument = await loadingTask.promise;
        
        // Una vez cargado el PDF, cambiar el mensaje
        loadingIndicator.querySelector('span').textContent = 'Preparando páginas...';
        
        // Crear placeholders para todas las páginas
        await createPagePlaceholders(pdfDocument.numPages);
        
        // Cargar las primeras páginas visibles
        loadVisiblePages();
        
        // Configurar evento de scroll para cargar páginas al desplazarse
        window.addEventListener('scroll', throttle(loadVisiblePages, 200));

        // Manejar redimensionamiento de ventana
        window.addEventListener('resize', debounce(() => {
            // Solo actualizar dimensiones sin volver a renderizar todo
            pdfDocument.getPage(1).then(page => {
                const scaleFactor = window.devicePixelRatio || 1;
                const scale = (pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width);
                
                renderedPages.forEach(async pageNum => {
                    try {
                        const pageToResize = await pdfDocument.getPage(pageNum);
                        const viewport = pageToResize.getViewport({ scale });
                        const canvas = canvasPool.get(pageNum);
                        if (canvas) {
                            canvas.style.width = `${viewport.width / scaleFactor}px`;
                            canvas.style.height = `${viewport.height / scaleFactor}px`;
                            
                            const container = document.getElementById(`page-container-${pageNum}`);
                            if (container) {
                                container.style.height = `${viewport.height / scaleFactor}px`;
                            }
                        }
                    } catch (error) {
                        console.error(`Error al redimensionar página ${pageNum}:`, error);
                    }
                });
            });
        }, 300));

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loadingIndicator.style.display = 'none';
    }
}

// Funciones auxiliares
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function debounce(func, delay) {
    let timeoutId;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, delay);
    };
}

document.addEventListener("DOMContentLoaded", loadPdf);