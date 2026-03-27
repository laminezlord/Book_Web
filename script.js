class BookManager {
      constructor() {
        this.books = this.loadFromStorage();
        this.filter = 'all';
        
        this.elements = {
          input: document.getElementById('bookInput'),
          addBtn: document.getElementById('addBookBtn'),
          list: document.getElementById('bookList'),
          emptyState: document.getElementById('emptyState'),
          totalCount: document.getElementById('totalCount'),
          readCount: document.getElementById('readCount'),
          progressPercent: document.getElementById('progressPercent'),
          toastContainer: document.getElementById('toastContainer'),
          filterBtns: document.querySelectorAll('.filter-btn')
        };

        this.init();
      }

      init() {
        this.bindEvents();
        this.render();
        lucide.createIcons();
      }

      bindEvents() {
        this.elements.addBtn.addEventListener('click', () => this.addBook());
        this.elements.input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.addBook();
        });

        this.elements.filterBtns.forEach(btn => {
          btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });

        this.elements.list.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;

          const id = parseInt(btn.dataset.id);
          if (btn.classList.contains('js-toggle-read')) {
            this.toggleRead(id);
          } else if (btn.classList.contains('js-delete')) {
            this.removeBook(id);
          }
        });
      }

      addBook() {
        const title = this.elements.input.value.trim();
        
        if (!title) {
          this.showToast('Please enter a book title', 'error');
          this.elements.input.focus();
          return;
        }

        const book = {
          id: Date.now(),
          title,
          read: false,
          createdAt: new Date().toISOString()
        };

        this.books.unshift(book);
        this.elements.input.value = '';
        this.saveToStorage();
        this.render();
        this.showToast(`"${title}" added to your library`, 'success');
      }

      removeBook(id) {
        const book = this.books.find(b => b.id === id);
        if (!book) return;

        this.books = this.books.filter(b => b.id !== id);
        this.saveToStorage();
        this.render();
        this.showToast(`"${book.title}" removed from library`, 'success');
      }

      toggleRead(id) {
        const book = this.books.find(b => b.id === id);
        if (!book) return;

        book.read = !book.read;
        this.saveToStorage();
        this.render();
        
        const message = book.read 
          ? `Completed "${book.title}"! Great job! 🎉` 
          : `Marked "${book.title}" as to read`;
        this.showToast(message, 'success');
      }

      setFilter(filter) {
        this.filter = filter;
        
        this.elements.filterBtns.forEach(btn => {
          const isActive = btn.dataset.filter === filter;
          btn.classList.toggle('active', isActive);
          btn.setAttribute('aria-selected', isActive);
        });
        
        this.render();
      }

      getFilteredBooks() {
        switch (this.filter) {
          case 'read':
            return this.books.filter(b => b.read);
          case 'unread':
            return this.books.filter(b => !b.read);
          default:
            return this.books;
        }
      }

      updateStats() {
        const total = this.books.length;
        const read = this.books.filter(b => b.read).length;
        const percent = total > 0 ? Math.round((read / total) * 100) : 0;

        this.animateNumber(this.elements.totalCount, total);
        this.animateNumber(this.elements.readCount, read);
        this.elements.progressPercent.textContent = `${percent}%`;
      }

      animateNumber(element, target) {
        const current = parseInt(element.textContent) || 0;
        if (current === target) return;
        
        element.style.transform = 'scale(1.2)';
        element.textContent = target;
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 150);
      }

      render() {
        const filteredBooks = this.getFilteredBooks();
        
        const isEmpty = filteredBooks.length === 0;
        this.elements.emptyState.style.display = isEmpty ? 'block' : 'none';
        this.elements.list.style.display = isEmpty ? 'none' : 'block';

        if (isEmpty) {
          this.updateStats();
          return;
        }

        this.elements.list.innerHTML = filteredBooks.map(book => this.renderBookItem(book)).join('');
        lucide.createIcons();
        this.updateStats();
      }

      renderBookItem(book) {
        const date = new Date(book.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        return `
          <li class="book-item ${book.read ? 'read' : ''}" data-id="${book.id}">
            <button 
              class="book-item__checkbox js-toggle-read" 
              data-id="${book.id}"
              aria-label="${book.read ? 'Mark as unread' : 'Mark as read'}"
              title="${book.read ? 'Mark as unread' : 'Mark as read'}"
            >
              ${book.read ? '<i data-lucide="check" style="width: 18px; height: 18px; stroke-width: 3;"></i>' : ''}
            </button>
            
            <div class="book-item__info">
              <div class="book-item__title">${this.escapeHtml(book.title)}</div>
              <div class="book-item__meta">Added on ${date}</div>
            </div>
            
            <div class="book-item__actions">
              <button 
                class="btn btn--icon btn--success js-toggle-read" 
                data-id="${book.id}"
                aria-label="${book.read ? 'Mark as unread' : 'Mark as read'}"
                title="${book.read ? 'Mark as unread' : 'Mark as read'}"
              >
                <i data-lucide="${book.read ? 'book-open' : 'check-circle-2'}" style="width: 20px; height: 20px;"></i>
              </button>
              <button 
                class="btn btn--icon btn--danger js-delete" 
                data-id="${book.id}"
                aria-label="Delete book"
                title="Delete book"
              >
                <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
              </button>
            </div>
          </li>
        `;
      }

      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      loadFromStorage() {
        try {
          const data = localStorage.getItem('bookManagerPro_books');
          return data ? JSON.parse(data) : [];
        } catch (e) {
          console.warn('Failed to load from storage:', e);
          return [];
        }
      }

      saveToStorage() {
        try {
          localStorage.setItem('bookManagerPro_books', JSON.stringify(this.books));
        } catch (e) {
          console.warn('Failed to save to storage:', e);
        }
      }

      showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
          <i data-lucide="${type === 'success' ? 'check-circle-2' : 'alert-circle'}" style="width: 24px; height: 24px; color: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};"></i>
          <span>${this.escapeHtml(message)}</span>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
          toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
          setTimeout(() => toast.remove(), 300);
        }, 3500);
      }
    }

    // Initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => new BookManager());
    } else {
      new BookManager();
    }