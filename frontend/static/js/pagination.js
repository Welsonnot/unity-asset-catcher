// ========================================================
// Glassmorphic Page Navigation grid controller
// Keeps the gallery paginated! Loading 3000 icons at once makes the browser laggy.
// ========================================================

let currentPage = 1; // Starts at page 1 by default
const pageSize = 24; // Slice exactly 24 elements per page

// Render Pagination Controls beautifully
function renderPaginationControls(totalItems) {
    const container = document.getElementById('pagination-controls');
    if (!container) return;
    
    if (totalItems <= pageSize) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = '';
    
    const totalPages = Math.ceil(totalItems / pageSize);
    
    // First Button
    const btnFirst = document.createElement('button');
    btnFirst.className = 'page-btn';
    btnFirst.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
    btnFirst.disabled = (currentPage === 1);
    btnFirst.title = "First Page";
    btnFirst.onclick = () => setPage(1);
    container.appendChild(btnFirst);
    
    // Prev Button
    const btnPrev = document.createElement('button');
    btnPrev.className = 'page-btn';
    btnPrev.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
    btnPrev.disabled = (currentPage === 1);
    btnPrev.title = "Previous Page";
    btnPrev.onclick = () => setPage(currentPage - 1);
    container.appendChild(btnPrev);
    
    // Generate smart pagination page numbers
    const addPageBtn = (page) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${currentPage === page ? 'active' : ''}`;
        btn.innerText = page;
        btn.onclick = () => setPage(page);
        container.appendChild(btn);
    };
    
    const addEllipsis = () => {
        const span = document.createElement('span');
        span.className = 'page-info';
        span.innerText = '...';
        container.appendChild(span);
    };
    
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) {
            addPageBtn(i);
        }
    } else {
        if (currentPage <= 3) {
            for (let i = 1; i <= 4; i++) {
                addPageBtn(i);
            }
            addEllipsis();
            addPageBtn(totalPages);
        } else if (currentPage >= totalPages - 2) {
            addPageBtn(1);
            addEllipsis();
            for (let i = totalPages - 3; i <= totalPages; i++) {
                addPageBtn(i);
            }
        } else {
            addPageBtn(1);
            addEllipsis();
            addPageBtn(currentPage - 1);
            addPageBtn(currentPage);
            addPageBtn(currentPage + 1);
            addEllipsis();
            addPageBtn(totalPages);
        }
    }
    
    // Next Button
    const btnNext = document.createElement('button');
    btnNext.className = 'page-btn';
    btnNext.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
    btnNext.disabled = (currentPage === totalPages);
    btnNext.title = "Next Page";
    btnNext.onclick = () => setPage(currentPage + 1);
    container.appendChild(btnNext);
    
    // Last Button
    const btnLast = document.createElement('button');
    btnLast.className = 'page-btn';
    btnLast.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
    btnLast.disabled = (currentPage === totalPages);
    btnLast.title = "Last Page";
    btnLast.onclick = () => setPage(totalPages);
    container.appendChild(btnLast);
}

// Change current page and smooth scroll back to catalog header
function setPage(page) {
    currentPage = page;
    renderGalleryGrid();
    
    setTimeout(() => {
        const galleryHeader = document.querySelector('.gallery-header');
        if (galleryHeader) {
            galleryHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}
