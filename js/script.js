const url = 'documents/Carta NAZCA-corregida.pdf';
const container = document.getElementById('pdf-container');
const pageSize = 5; // Número de páginas a cargar de manera incremental

pdfjsLib.getDocument(url).promise.then(pdf => {
  const totalPages = pdf.numPages;
  let currentPage = 1;

  function loadNextPages() {
    for (let i = currentPage; i <= Math.min(currentPage + pageSize - 1, totalPages); i++) {
      pdf.getPage(i).then(page => {
        const scale = container.clientWidth / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: context, viewport: viewport });
      });
    }
    currentPage += pageSize;

    // Verificar si hay más páginas después de la página actual
    if (currentPage <= totalPages) {
      loadNextPages();
    }
  }

  loadNextPages();

  // Agregar un evento de scroll para cargar las siguientes páginas
  container.addEventListener('scroll', () => {
    if (container.scrollTop + container.offsetHeight >= container.scrollHeight) {
      if (currentPage <= totalPages) {
        loadNextPages();
      }
    }
  });
});