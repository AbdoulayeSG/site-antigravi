// Application State with Firebase
const app = {
  currentUser: null,
  currentView: 'home',
  editingProductId: null,
  useFirebase: false,
  currentProductImages: [],
  currentImageIndex: 0,
  currentDetailProduct: null,
  carouselIndex: 0,
  carouselTimer: null,
  isAdmin: false,
  allProducts: [],
  filteredProducts: [],
  searchQuery: '',

  // CONFIGURATION ADMIN - À MODIFIER
  adminCredentials: {
    email: 'admin@yombleh.com',
    password: 'Admin123!'
  },

  // Carousel slides data
  carouselSlides: [
    {
      image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&h=400&fit=crop',
      title: 'Offres Exceptionnelles',
      description: 'Découvrez nos meilleures promotions'
    },
    {
      image: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=1200&h=400&fit=crop',
      title: 'Nouveautés du Moment',
      description: 'Les derniers produits ajoutés'
    },
    {
      image: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200&h=400&fit=crop',
      title: 'Vendez Facilement',
      description: 'Rejoignez notre plateforme dès maintenant'
    }
  ],

  init() {
    this.checkFirebaseConfig();
    this.loadCarouselSlides();

    if (this.useFirebase) {
      this.initFirebase();
    } else {
      this.initLocalStorage();
    }

    this.updateNavigation();
    this.loadProducts();
    this.startCarousel();
    this.renderCarousel();

    // Check for admin hash
    if (window.location.hash === '#admin') {
      this.showAdminLoginModal();
    }
  },

  checkFirebaseConfig() {
    try {
      if (window.firebase &&
        window.firebase.auth &&
        !window.firebase.auth.app.options.apiKey.includes('VOTRE')) {
        this.useFirebase = true;
        console.log('✅ Firebase configuré et activé');
      } else {
        console.warn('⚠️ Firebase non configuré - Mode LocalStorage actif');
        this.showMessage('Mode LocalStorage - Les données ne sont visibles que localement.', 'warning');
      }
    } catch (e) {
      console.warn('⚠️ Firebase non disponible - Mode LocalStorage');
    }
  },

  initFirebase() {
    const { auth } = window.firebase;
    const { onAuthStateChanged } = window.firebase.authMethods;

    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        this.loadFirebaseUserData(firebaseUser.uid);
      } else {
        this.currentUser = null;
        this.updateNavigation();
      }
    });

    this.listenToProducts();
  },

  initLocalStorage() {
    this.loadCurrentUser();
  },

  async loadFirebaseUserData(uid) {
    const { database } = window.firebase;
    const { ref, get } = window.firebase.dbMethods;

    try {
      const userSnapshot = await get(ref(database, `users/${uid}`));
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        this.currentUser = { uid, ...userData };

        // Check if user is approved
        if (userData.status === 'pending') {
          this.showMessage('Votre compte est en attente de validation par un administrateur.', 'warning');
        } else if (userData.status === 'banned') {
          this.showMessage('Votre compte a été banni.', 'error');
          await this.logout();
          return;
        }

        this.updateNavigation();
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  },

  listenToProducts() {
    const { database } = window.firebase;
    const { ref, onValue } = window.firebase.dbMethods;

    onValue(ref(database, 'products'), (snapshot) => {
      if (this.currentView === 'home') {
        this.loadProducts();
      } else if (this.currentView === 'dashboard') {
        this.loadUserProducts();
      }
    });
  },

  // Admin Functions
  showAdminLoginModal() {
    document.getElementById('admin-login-modal').style.display = 'flex';
  },

  closeAdminModal() {
    document.getElementById('admin-login-modal').style.display = 'none';
    window.location.hash = '';
  },

  adminLogin(event) {
    event.preventDefault();

    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (email === this.adminCredentials.email && password === this.adminCredentials.password) {
      this.isAdmin = true;
      this.closeAdminModal();
      this.showView('admin');
      this.loadAdminData();
      this.showMessage('Connecté en tant qu\'administrateur', 'success');
    } else {
      this.showMessage('Identifiants administrateur incorrects', 'error');
    }
  },

  adminLogout() {
    this.isAdmin = false;
    this.showView('home');
    window.location.hash = '';
    this.showMessage('Déconnexion admin réussie', 'success');
  },

  async loadAdminData() {
    await this.loadAdminUsers();
    await this.loadAdminProducts();
    this.loadAdminCarousel();
  },

  showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`admin-${tab}-tab`).classList.add('active');

    if (tab === 'users') this.loadAdminUsers();
    if (tab === 'products') this.loadAdminProducts();
    if (tab === 'carousel') this.loadAdminCarousel();
  },

  async loadAdminUsers(filter = 'all') {
    let users = [];

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, 'users'));
        if (snapshot.exists()) {
          snapshot.forEach(child => {
            users.push({ uid: child.key, ...child.val() });
          });
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    } else {
      users = this.getUsers();
    }

    if (filter !== 'all') {
      users = users.filter(u => u.status === filter);
    }

    const container = document.getElementById('admin-users-list');
    if (users.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucun utilisateur</p>';
      return;
    }

    container.innerHTML = users.map(user => this.renderAdminUserCard(user)).join('');
  },

  renderAdminUserCard(user) {
    const statusBadge = {
      pending: '<span class="status-badge status-pending">En attente</span>',
      approved: '<span class="status-badge status-approved">Approuvé</span>',
      banned: '<span class="status-badge status-banned">Banni</span>'
    };

    const userId = user.uid || user.id;
    const status = user.status || 'approved';

    return `
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>${this.escapeHtml(user.name)}</h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">${user.email}</p>
            <p style="color: var(--text-muted); font-size: 0.85rem;">📱 ${user.whatsapp}</p>
          </div>
          ${statusBadge[status] || statusBadge.approved}
        </div>
        <div class="admin-card-actions">
          ${status === 'pending' ? `<button class="btn btn-success" onclick="app.approveUser('${userId}')">✅ Approuver</button>` : ''}
          ${status !== 'banned' ? `<button class="btn btn-danger" onclick="app.banUser('${userId}')">🚫 Bannir</button>` : ''}
          ${status === 'banned' ? `<button class="btn btn-success" onclick="app.unbanUser('${userId}')">✅ Débannir</button>` : ''}
        </div>
      </div>
    `;
  },

  async approveUser(userId) {
    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, update } = window.firebase.dbMethods;

      try {
        await update(ref(database, `users/${userId}`), {
          status: 'approved',
          approvedAt: new Date().toISOString()
        });
        this.showMessage('Utilisateur approuvé', 'success');
        this.loadAdminUsers();
      } catch (error) {
        console.error('Error approving user:', error);
        this.showMessage('Erreur lors de l\'approbation', 'error');
      }
    } else {
      const users = this.getUsers();
      const user = users.find(u => u.id === userId);
      if (user) {
        user.status = 'approved';
        user.approvedAt = new Date().toISOString();
        this.saveUsers(users);
        this.showMessage('Utilisateur approuvé', 'success');
        this.loadAdminUsers();
      }
    }
  },

  async banUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir bannir cet utilisateur ?')) return;

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, update } = window.firebase.dbMethods;

      try {
        await update(ref(database, `users/${userId}`), {
          status: 'banned',
          bannedAt: new Date().toISOString()
        });
        this.showMessage('Utilisateur banni', 'success');
        this.loadAdminUsers();
      } catch (error) {
        console.error('Error banning user:', error);
        this.showMessage('Erreur lors du bannissement', 'error');
      }
    } else {
      const users = this.getUsers();
      const user = users.find(u => u.id === userId);
      if (user) {
        user.status = 'banned';
        user.bannedAt = new Date().toISOString();
        this.saveUsers(users);
        this.showMessage('Utilisateur banni', 'success');
        this.loadAdminUsers();
      }
    }
  },

  async unbanUser(userId) {
    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, update } = window.firebase.dbMethods;

      try {
        await update(ref(database, `users/${userId}`), {
          status: 'approved',
          unbannedAt: new Date().toISOString()
        });
        this.showMessage('Utilisateur débanni', 'success');
        this.loadAdminUsers();
      } catch (error) {
        console.error('Error unbanning user:', error);
      }
    } else {
      const users = this.getUsers();
      const user = users.find(u => u.id === userId);
      if (user) {
        user.status = 'approved';
        user.unbannedAt = new Date().toISOString();
        this.saveUsers(users);
        this.showMessage('Utilisateur débanni', 'success');
        this.loadAdminUsers();
      }
    }
  },

  filterUsers(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    this.loadAdminUsers(filter);
  },

  async loadAdminProducts() {
    let products = [];

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, 'products'));
        if (snapshot.exists()) {
          snapshot.forEach(child => {
            products.push({ id: child.key, ...child.val() });
          });
        }
      } catch (error) {
        console.error('Error loading products:', error);
      }
    } else {
      products = this.getProducts();
    }

    const container = document.getElementById('admin-products-list');
    if (products.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucun produit</p>';
      return;
    }

    container.innerHTML = products.map(product => this.renderAdminProductCard(product)).join('');
  },

  renderAdminProductCard(product) {
    const images = product.images || (product.image ? [product.image] : []);
    const mainImage = images[0] || 'https://via.placeholder.com/100?text=Produit';

    return `
      <div class="admin-card">
        <div style="display: flex; gap: 1rem; align-items: center;">
          <img src="${mainImage}" style="width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md);">
          <div style="flex: 1;">
            <h3>${this.escapeHtml(product.name)}</h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">${this.escapeHtml(product.description)}</p>
            <p style="color: var(--primary); font-weight: 600; margin-top: 0.5rem;">${this.formatPrice(product.price)} FCFA</p>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Vendeur: ${this.escapeHtml(product.sellerName || 'Inconnu')}</p>
          </div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-danger" onclick="app.adminDeleteProduct('${product.id}')">🗑️ Supprimer</button>
        </div>
      </div>
    `;
  },

  async adminDeleteProduct(productId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, remove } = window.firebase.dbMethods;

      try {
        await remove(ref(database, `products/${productId}`));
        this.showMessage('Produit supprimé', 'success');
        this.loadAdminProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        this.showMessage('Erreur lors de la suppression', 'error');
      }
    } else {
      const products = this.getProducts();
      const filtered = products.filter(p => p.id !== productId);
      this.saveProducts(filtered);
      this.showMessage('Produit supprimé', 'success');
      this.loadAdminProducts();
    }
  },

  // Carousel Management
  loadCarouselSlides() {
    const saved = localStorage.getItem('carousel_slides');
    if (saved) {
      this.carouselSlides = JSON.parse(saved);
    }
  },

  saveCarouselSlidesToStorage() {
    localStorage.setItem('carousel_slides', JSON.stringify(this.carouselSlides));
  },

  loadAdminCarousel() {
    const container = document.getElementById('carousel-slides-list');
    container.innerHTML = this.carouselSlides.map((slide, index) => `
      <div class="carousel-slide-item">
        <img src="${slide.image}" alt="${slide.title}">
        <div style="flex: 1;">
          <h3>${this.escapeHtml(slide.title)}</h3>
          <p style="color: var(--text-secondary);">${this.escapeHtml(slide.description)}</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" onclick="app.editCarouselSlide(${index})">✏️ Modifier</button>
          <button class="btn btn-danger" onclick="app.deleteCarouselSlide(${index})">🗑️</button>
        </div>
      </div>
    `).join('');
  },

  saveCarouselSlide(event) {
    event.preventDefault();

    const index = document.getElementById('slide-index').value;
    const title = document.getElementById('slide-title').value.trim();
    const description = document.getElementById('slide-description').value.trim();
    const image = document.getElementById('slide-image').value.trim();

    const slide = { title, description, image };

    if (index === '') {
      this.carouselSlides.push(slide);
      this.showMessage('Slide ajoutée', 'success');
    } else {
      this.carouselSlides[parseInt(index)] = slide;
      this.showMessage('Slide modifiée', 'success');
    }

    this.saveCarouselSlidesToStorage();
    this.renderCarousel();
    this.resetCarouselForm();
    this.loadAdminCarousel();
  },

  editCarouselSlide(index) {
    const slide = this.carouselSlides[index];
    document.getElementById('slide-index').value = index;
    document.getElementById('slide-title').value = slide.title;
    document.getElementById('slide-description').value = slide.description;
    document.getElementById('slide-image').value = slide.image;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  deleteCarouselSlide(index) {
    if (!confirm('Supprimer cette slide ?')) return;

    this.carouselSlides.splice(index, 1);
    this.saveCarouselSlidesToStorage();
    this.renderCarousel();
    this.loadAdminCarousel();
    this.showMessage('Slide supprimée', 'success');
  },

  resetCarouselForm() {
    document.getElementById('carousel-form').reset();
    document.getElementById('slide-index').value = '';
  },

  renderCarousel() {
    const container = document.querySelector('.carousel-container');
    if (!container) return;

    container.innerHTML = this.carouselSlides.map((slide, index) => `
      <div class="carousel-slide ${index === 0 ? 'active' : ''}">
        <img src="${slide.image}" alt="${slide.title}">
        <div class="carousel-overlay">
          <h2>${this.escapeHtml(slide.title)}</h2>
          <p>${this.escapeHtml(slide.description)}</p>
        </div>
      </div>
    `).join('');

    const indicators = document.querySelector('.carousel-indicators');
    if (indicators) {
      indicators.innerHTML = this.carouselSlides.map((_, index) =>
        `<span class="indicator ${index === 0 ? 'active' : ''}" onclick="app.carouselGoTo(${index})"></span>`
      ).join('');
    }

    this.carouselIndex = 0;
  },

  // Search Functions
  searchProducts(event) {
    this.searchQuery = event.target.value.toLowerCase().trim();
    const clearBtn = document.getElementById('search-clear');

    if (this.searchQuery) {
      clearBtn.style.display = 'flex';
      this.filterAndRenderProducts();
    } else {
      clearBtn.style.display = 'none';
      this.renderProducts(this.allProducts);
    }
  },

  clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').style.display = 'none';
    this.searchQuery = '';
    this.renderProducts(this.allProducts);
  },

  filterAndRenderProducts() {
    const filtered = this.allProducts.filter(product => {
      const searchLower = this.searchQuery;
      return product.name.toLowerCase().includes(searchLower) ||
        product.description.toLowerCase().includes(searchLower) ||
        (product.sellerName && product.sellerName.toLowerCase().includes(searchLower));
    });

    this.renderProducts(filtered);
  },

  // User Management
  getUsers() {
    return JSON.parse(localStorage.getItem('marketplace_users') || '[]');
  },

  saveUsers(users) {
    localStorage.setItem('marketplace_users', JSON.stringify(users));
  },

  getProducts() {
    return JSON.parse(localStorage.getItem('marketplace_products') || '[]');
  },

  saveProducts(products) {
    localStorage.setItem('marketplace_products', JSON.stringify(products));
  },

  loadCurrentUser() {
    const userEmail = localStorage.getItem('marketplace_current_user');
    if (userEmail) {
      const users = this.getUsers();
      this.currentUser = users.find(u => u.email === userEmail);

      if (this.currentUser && this.currentUser.status === 'banned') {
        this.showMessage('Votre compte a été banni.', 'error');
        this.currentUser = null;
        localStorage.removeItem('marketplace_current_user');
      }
    }
  },

  async register(event) {
    event.preventDefault();

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const whatsapp = document.getElementById('register-whatsapp').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (password !== passwordConfirm) {
      this.showMessage('Les mots de passe ne correspondent pas', 'error');
      return;
    }

    if (this.useFirebase) {
      await this.registerFirebase(name, email, whatsapp, password);
    } else {
      this.registerLocalStorage(name, email, whatsapp, password);
    }
  },

  async registerFirebase(name, email, whatsapp, password) {
    const { auth, database } = window.firebase;
    const { createUserWithEmailAndPassword, signOut } = window.firebase.authMethods;
    const { ref, set } = window.firebase.dbMethods;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      await set(ref(database, `users/${uid}`), {
        name,
        email,
        whatsapp,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      await signOut(auth);

      this.showMessage('Compte créé ! En attente de validation par l\'administrateur. Vous recevrez une notification par email.', 'warning');
      this.showView('home');
    } catch (error) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        this.showMessage('Cet email est déjà utilisé', 'error');
      } else {
        this.showMessage(`Erreur: ${error.message}`, 'error');
      }
    }
  },

  registerLocalStorage(name, email, whatsapp, password) {
    const users = this.getUsers();

    if (users.find(u => u.email === email)) {
      this.showMessage('Cet email est déjà utilisé', 'error');
      return;
    }

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      whatsapp,
      password: this.hashPassword(password),
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    users.push(newUser);
    this.saveUsers(users);

    this.showMessage('Compte créé ! En attente de validation par l\'administrateur.', 'warning');
    this.showView('home');
  },

  async login(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (this.useFirebase) {
      await this.loginFirebase(email, password);
    } else {
      this.loginLocalStorage(email, password);
    }
  },

  async loginFirebase(email, password) {
    const { auth } = window.firebase;
    const { signInWithEmailAndPassword } = window.firebase.authMethods;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      this.showView('dashboard');
      this.loadUserProducts();
    } catch (error) {
      console.error('Login error:', error);
      this.showMessage('Email ou mot de passe incorrect', 'error');
    }
  },

  loginLocalStorage(email, password) {
    const users = this.getUsers();
    const user = users.find(u => u.email === email && u.password === this.hashPassword(password));

    if (!user) {
      this.showMessage('Email ou mot de passe incorrect', 'error');
      return;
    }

    if (user.status === 'banned') {
      this.showMessage('Votre compte a été banni.', 'error');
      return;
    }

    this.currentUser = user;
    localStorage.setItem('marketplace_current_user', email);

    if (user.status === 'pending') {
      this.showMessage('Votre compte est en attente de validation.', 'warning');
    } else {
      this.showMessage(`Bienvenue ${user.name} !`, 'success');
    }

    this.updateNavigation();
    this.showView('dashboard');
    this.loadUserProducts();
  },

  async logout() {
    if (this.useFirebase) {
      const { auth } = window.firebase;
      const { signOut } = window.firebase.authMethods;
      await signOut(auth);
    }

    this.currentUser = null;
    localStorage.removeItem('marketplace_current_user');
    this.updateNavigation();
    this.showView('home');
    this.showMessage('Vous êtes déconnecté', 'success');
  },

  hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  },

  updateNavigation() {
    const nav = document.getElementById('nav');
    const headerIcons = document.getElementById('header-icons');

    if (this.currentUser) {
      const canSell = this.currentUser.status === 'approved' || !this.currentUser.status;

      nav.innerHTML = `
        ${canSell ? `<button class="btn btn-secondary" onclick="app.showView('dashboard')">📊 Mon Espace</button>` : ''}
        <button class="btn btn-secondary" onclick="app.showView('home')">🏠 Catalogue</button>
        <button class="btn btn-secondary" onclick="app.logout()">🚪 Déconnexion</button>
      `;
      headerIcons.innerHTML = '';

      const userName = document.getElementById('user-name-display');
      const userWhatsApp = document.getElementById('user-whatsapp-display');
      if (userName) userName.textContent = this.currentUser.name;
      if (userWhatsApp) userWhatsApp.textContent = `📱 ${this.currentUser.whatsapp}`;
    } else {
      nav.innerHTML = '';
      headerIcons.innerHTML = `
        <button class="header-icon-btn" onclick="app.showView('login')" title="Se connecter">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span class="icon-tooltip">Connexion</span>
        </button>
        <button class="header-icon-btn" onclick="app.showView('register')" title="Créer un compte">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <span class="icon-tooltip">Inscription</span>
        </button>
      `;
    }
  },

  showView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });

    const view = document.getElementById(`${viewName}-view`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;

      if (viewName === 'home') {
        this.loadProducts();
      } else if (viewName === 'dashboard') {
        if (this.currentUser && (this.currentUser.status === 'pending' || this.currentUser.status === 'banned')) {
          this.showView('home');
          this.showMessage(this.currentUser.status === 'pending' ?
            'Votre compte est en attente de validation.' :
            'Votre compte a été banni.', 'warning');
          return;
        }
        this.loadUserProducts();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  async loadProducts() {
    if (this.useFirebase) {
      await this.loadProductsFirebase();
    } else {
      this.loadProductsLocalStorage();
    }
  },

  async loadProductsFirebase() {
    const { database } = window.firebase;
    const { ref, get } = window.firebase.dbMethods;

    try {
      const snapshot = await get(ref(database, 'products'));
      const products = [];

      if (snapshot.exists()) {
        snapshot.forEach(child => {
          products.push({ id: child.key, ...child.val() });
        });
      }

      this.allProducts = products;

      if (this.searchQuery) {
        this.filterAndRenderProducts();
      } else {
        this.renderProducts(products);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      this.renderProducts([]);
    }
  },

  loadProductsLocalStorage() {
    const products = this.getProducts();
    this.allProducts = products;

    if (this.searchQuery) {
      this.filterAndRenderProducts();
    } else {
      this.renderProducts(products);
    }
  },

  renderProducts(products) {
    const container = document.getElementById('home-products');

    if (products.length === 0) {
      const message = this.searchQuery ?
        'Aucun produit ne correspond à votre recherche' :
        'Aucun produit disponible pour le moment';

      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
          <p style="font-size: 1.2rem;">${message}</p>
          ${!this.searchQuery ? '<p style="margin-top: 1rem;">Soyez le premier à ajouter un produit !</p>' : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(product => this.renderProductCard(product)).join('');
  },

  async loadUserProducts() {
    if (!this.currentUser) return;

    if (this.useFirebase) {
      await this.loadUserProductsFirebase();
    } else {
      this.loadUserProductsLocalStorage();
    }
  },

  async loadUserProductsFirebase() {
    const { database } = window.firebase;
    const { ref, get } = window.firebase.dbMethods;

    try {
      const snapshot = await get(ref(database, 'products'));
      const products = [];

      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const product = child.val();
          if (product.userId === this.currentUser.uid) {
            products.push({ id: child.key, ...product });
          }
        });
      }

      this.renderUserProducts(products);
    } catch (error) {
      console.error('Error loading user products:', error);
    }
  },

  loadUserProductsLocalStorage() {
    const products = this.getProducts().filter(p => p.userId === this.currentUser.id);
    this.renderUserProducts(products);
  },

  renderUserProducts(products) {
    const container = document.getElementById('my-products-list');

    if (products.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 3rem;">
          <p style="font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
            Vous n'avez pas encore de produits
          </p>
          <button class="btn btn-primary" onclick="app.showView('add-product')" style="max-width: 300px; margin: 0 auto;">
            ➕ Ajouter mon Premier Produit
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(product => this.renderMyProductItem(product)).join('');
  },

  renderProductCard(product) {
    let sellerName = 'Vendeur';

    if (this.useFirebase && product.sellerName) {
      sellerName = product.sellerName;
    } else if (!this.useFirebase) {
      const users = this.getUsers();
      const seller = users.find(u => u.id === product.userId);
      sellerName = seller ? seller.name : 'Vendeur inconnu';
    }

    const images = product.images || (product.image ? [product.image] : []);
    const mainImage = images[0] || 'https://via.placeholder.com/300x220?text=Produit';

    return `
      <div class="product-card" onclick="app.showProductDetail('${product.id}')">
        <img src="${mainImage}" 
             alt="${product.name}" 
             class="product-image">
        <div class="product-info">
          <h3 class="product-title">${this.escapeHtml(product.name)}</h3>
          <p class="product-description">${this.escapeHtml(product.description)}</p>
          <div class="product-price">${this.formatPrice(product.price)} FCFA</div>
          <div class="product-seller">Vendu par ${this.escapeHtml(sellerName)}</div>
        </div>
      </div>
    `;
  },

  renderMyProductItem(product) {
    const images = product.images || (product.image ? [product.image] : []);
    const mainImage = images[0] || 'https://via.placeholder.com/100?text=Produit';

    return `
      <div class="my-product-item">
        <img src="${mainImage}" 
             alt="${product.name}" 
             class="my-product-thumbnail">
        <div class="my-product-details">
          <h3 style="font-size: 1.2rem; margin-bottom: 0.5rem;">${this.escapeHtml(product.name)}</h3>
          <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">${this.escapeHtml(product.description)}</p>
          <div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">
            ${this.formatPrice(product.price)} FCFA
          </div>
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
            📱 ${product.whatsapp}
          </div>
          ${images.length > 1 ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">📸 ${images.length} images</div>` : ''}
        </div>
        <div class="my-product-actions">
          <button class="btn btn-secondary" onclick="event.stopPropagation(); app.editProduct('${product.id}')">
            ✏️ Modifier
          </button>
          <button class="btn btn-danger" onclick="event.stopPropagation(); app.deleteProduct('${product.id}')">
            🗑️ Supprimer
          </button>
        </div>
      </div>
    `;
  },

  async showProductDetail(productId) {
    let product;

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, `products/${productId}`));
        if (snapshot.exists()) {
          product = { id: productId, ...snapshot.val() };
        }
      } catch (error) {
        console.error('Error loading product:', error);
      }
    } else {
      const products = this.getProducts();
      product = products.find(p => p.id === productId);
    }

    if (!product) {
      this.showMessage('Produit introuvable', 'error');
      return;
    }

    this.currentDetailProduct = product;
    this.currentProductImages = product.images || (product.image ? [product.image] : ['https://via.placeholder.com/600?text=Produit']);
    this.currentImageIndex = 0;

    let sellerName = 'Vendeur';
    if (this.useFirebase && product.sellerName) {
      sellerName = product.sellerName;
    } else if (!this.useFirebase) {
      const users = this.getUsers();
      const seller = users.find(u => u.id === product.userId);
      sellerName = seller ? seller.name : 'Vendeur inconnu';
    }

    document.getElementById('detail-product-name').textContent = product.name;
    document.getElementById('detail-product-price').textContent = `${this.formatPrice(product.price)} FCFA`;
    document.getElementById('detail-product-seller').textContent = `Vendu par ${sellerName}`;
    document.getElementById('detail-product-description').textContent = product.description;
    document.getElementById('detail-main-image').src = this.currentProductImages[0];

    const thumbnailsContainer = document.getElementById('detail-thumbnails');
    thumbnailsContainer.innerHTML = this.currentProductImages.map((img, index) => `
      <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="app.setMainImage(${index})">
        <img src="${img}" alt="Image ${index + 1}">
      </div>
    `).join('');

    const prevBtn = document.getElementById('gallery-prev-btn');
    const nextBtn = document.getElementById('gallery-next-btn');
    if (this.currentProductImages.length <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
    }

    const whatsappBtn = document.getElementById('detail-whatsapp-btn');
    whatsappBtn.onclick = () => this.orderViaWhatsApp(productId);

    await this.loadSuggestions(product);

    this.showView('product-detail');
  },

  async loadSuggestions(currentProduct) {
    let allProducts = [];

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, 'products'));
        if (snapshot.exists()) {
          snapshot.forEach(child => {
            const product = { id: child.key, ...child.val() };
            if (product.id !== currentProduct.id) {
              allProducts.push(product);
            }
          });
        }
      } catch (error) {
        console.error('Error loading suggestions:', error);
      }
    } else {
      allProducts = this.getProducts().filter(p => p.id !== currentProduct.id);
    }

    const suggestions = allProducts.slice(0, 4);
    const suggestionsContainer = document.getElementById('suggestions-grid');
    suggestionsContainer.innerHTML = suggestions.map(product => this.renderProductCard(product)).join('');
  },

  setMainImage(index) {
    this.currentImageIndex = index;
    document.getElementById('detail-main-image').src = this.currentProductImages[index];

    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });
  },

  previousImage() {
    this.currentImageIndex = (this.currentImageIndex - 1 + this.currentProductImages.length) % this.currentProductImages.length;
    this.setMainImage(this.currentImageIndex);
  },

  nextImage() {
    this.currentImageIndex = (this.currentImageIndex + 1) % this.currentProductImages.length;
    this.setMainImage(this.currentImageIndex);
  },

  closeProductDetail() {
    this.showView('home');
    this.currentDetailProduct = null;
    this.currentProductImages = [];
    this.currentImageIndex = 0;
  },

  async saveProduct(event) {
    event.preventDefault();

    if (!this.currentUser) {
      this.showMessage('Vous devez être connecté', 'error');
      return;
    }

    if (this.currentUser.status === 'pending') {
      this.showMessage('Votre compte est en attente de validation', 'warning');
      return;
    }

    if (this.currentUser.status === 'banned') {
      this.showMessage('Votre compte a été banni', 'error');
      return;
    }

    const name = document.getElementById('product-name').value.trim();
    const description = document.getElementById('product-description').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const whatsapp = document.getElementById('product-whatsapp').value.trim();

    const imagesPreview = document.querySelectorAll('#images-preview .upload-preview-item img');
    const images = Array.from(imagesPreview).map(img => img.src);

    if (this.useFirebase) {
      await this.saveProductFirebase(name, description, price, whatsapp, images);
    } else {
      this.saveProductLocalStorage(name, description, price, whatsapp, images);
    }
  },

  async saveProductFirebase(name, description, price, whatsapp, images) {
    const { database } = window.firebase;
    const { ref, set, push, update } = window.firebase.dbMethods;

    const productData = {
      userId: this.currentUser.uid,
      sellerName: this.currentUser.name,
      name,
      description,
      price,
      whatsapp,
      images,
      updatedAt: new Date().toISOString()
    };

    try {
      if (this.editingProductId) {
        await update(ref(database, `products/${this.editingProductId}`), productData);
        this.showMessage('Produit modifié avec succès !', 'success');
      } else {
        productData.createdAt = new Date().toISOString();
        await push(ref(database, 'products'), productData);
        this.showMessage('Produit ajouté avec succès !', 'success');
      }

      this.resetProductForm();
    } catch (error) {
      console.error('Error saving product:', error);
      this.showMessage('Erreur lors de la sauvegarde', 'error');
    }
  },

  saveProductLocalStorage(name, description, price, whatsapp, images) {
    const products = this.getProducts();

    if (this.editingProductId) {
      const index = products.findIndex(p => p.id === this.editingProductId);
      if (index !== -1) {
        products[index] = {
          ...products[index],
          name,
          description,
          price,
          whatsapp,
          images: images.length > 0 ? images : products[index].images,
          updatedAt: new Date().toISOString()
        };
      }
      this.showMessage('Produit modifié avec succès !', 'success');
    } else {
      const newProduct = {
        id: Date.now().toString(),
        userId: this.currentUser.id,
        name,
        description,
        price,
        whatsapp,
        images,
        createdAt: new Date().toISOString()
      };
      products.push(newProduct);
      this.showMessage('Produit ajouté avec succès !', 'success');
    }

    this.saveProducts(products);
    this.resetProductForm();
  },

  resetProductForm() {
    this.editingProductId = null;
    document.getElementById('product-form').reset();
    document.getElementById('images-preview').innerHTML = '';
    document.getElementById('product-form-title').textContent = 'Ajouter un Nouveau Produit';
    this.showView('dashboard');
  },

  async editProduct(productId) {
    let product;

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, `products/${productId}`));
        if (snapshot.exists()) {
          product = { id: productId, ...snapshot.val() };
        }
      } catch (error) {
        console.error('Error loading product:', error);
      }
    } else {
      const products = this.getProducts();
      product = products.find(p => p.id === productId);
    }

    if (!product) {
      this.showMessage('Produit introuvable', 'error');
      return;
    }

    const userId = this.useFirebase ? product.userId : product.userId;
    const currentUserId = this.useFirebase ? this.currentUser.uid : this.currentUser.id;

    if (userId !== currentUserId) {
      this.showMessage('Vous ne pouvez pas modifier ce produit', 'error');
      return;
    }

    this.editingProductId = productId;

    document.getElementById('product-id').value = productId;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-whatsapp').value = product.whatsapp;

    const images = product.images || (product.image ? [product.image] : []);
    if (images.length > 0) {
      const preview = document.getElementById('images-preview');
      preview.innerHTML = images.map((img, index) => `
        <div class="upload-preview-item">
          <img src="${img}">
          <button type="button" class="upload-preview-remove" onclick="app.removePreviewImage(${index})">×</button>
        </div>
      `).join('');
    }

    document.getElementById('product-form-title').textContent = 'Modifier le Produit';
    this.showView('add-product');
  },

  async deleteProduct(productId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      return;
    }

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, remove } = window.firebase.dbMethods;

      try {
        await remove(ref(database, `products/${productId}`));
        this.showMessage('Produit supprimé', 'success');
        this.loadUserProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        this.showMessage('Erreur lors de la suppression', 'error');
      }
    } else {
      const products = this.getProducts();
      const filtered = products.filter(p => p.id !== productId);
      this.saveProducts(filtered);
      this.showMessage('Produit supprimé', 'success');
      this.loadUserProducts();
    }
  },

  cancelProductEdit() {
    this.resetProductForm();
  },

  previewImages(event) {
    const files = Array.from(event.target.files);
    const preview = document.getElementById('images-preview');

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'upload-preview-item';
        div.innerHTML = `
          <img src="${e.target.result}">
          <button type="button" class="upload-preview-remove" onclick="app.removePreviewImage(${preview.children.length})">×</button>
        `;
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  },

  removePreviewImage(index) {
    const preview = document.getElementById('images-preview');
    const items = preview.querySelectorAll('.upload-preview-item');
    if (items[index]) {
      items[index].remove();
    }
  },

  async orderViaWhatsApp(productId) {
    let product;

    if (this.useFirebase) {
      const { database } = window.firebase;
      const { ref, get } = window.firebase.dbMethods;

      try {
        const snapshot = await get(ref(database, `products/${productId}`));
        if (snapshot.exists()) {
          product = { id: productId, ...snapshot.val() };
        }
      } catch (error) {
        console.error('Error loading product:', error);
      }
    } else {
      const products = this.getProducts();
      product = products.find(p => p.id === productId);
    }

    if (!product) {
      this.showMessage('Produit introuvable', 'error');
      return;
    }

    const message = `Bonjour, je suis intéressé(e) par votre produit :\n\n` +
      `📦 ${product.name}\n` +
      `💰 ${this.formatPrice(product.price)} FCFA\n\n` +
      `Merci de me contacter.`;

    const whatsappNumber = product.whatsapp.replace(/\s/g, '');
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  },

  showMessage(text, type = 'success') {
    const container = document.getElementById('message-container');
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;

    container.appendChild(message);

    setTimeout(() => {
      message.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => message.remove(), 300);
    }, 5000);
  },

  formatPrice(price) {
    return new Intl.NumberFormat('fr-FR').format(price);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  startCarousel() {
    this.carouselTimer = setInterval(() => {
      this.carouselNext();
    }, 5000);
  },

  stopCarousel() {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
    }
  },

  carouselGoTo(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');

    if (!slides.length) return;

    slides[this.carouselIndex].classList.remove('active');
    indicators[this.carouselIndex].classList.remove('active');

    this.carouselIndex = index;

    slides[this.carouselIndex].classList.add('active');
    indicators[this.carouselIndex].classList.add('active');

    this.stopCarousel();
    this.startCarousel();
  },

  carouselNext() {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');

    if (!slides.length) return;

    slides[this.carouselIndex].classList.remove('active');
    indicators[this.carouselIndex].classList.remove('active');

    this.carouselIndex = (this.carouselIndex + 1) % slides.length;

    slides[this.carouselIndex].classList.add('active');
    indicators[this.carouselIndex].classList.add('active');
  },

  carouselPrev() {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');

    if (!slides.length) return;

    slides[this.carouselIndex].classList.remove('active');
    indicators[this.carouselIndex].classList.remove('active');

    this.carouselIndex = (this.carouselIndex - 1 + slides.length) % slides.length;

    slides[this.carouselIndex].classList.add('active');
    indicators[this.carouselIndex].classList.add('active');

    this.stopCarousel();
    this.startCarousel();
  }
};

const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    to {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
  
  .message.warning {
    background: hsla(40, 90%, 50%, 0.1);
    border: 1px solid var(--warning);
    color: hsl(25, 80%, 35%);
  }
`;
document.head.appendChild(style);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

document.addEventListener('click', (e) => {
  if (e.target.matches('[onclick*="add-product"]')) {
    setTimeout(() => {
      if (app.currentUser && !app.editingProductId) {
        const whatsappField = document.getElementById('product-whatsapp');
        if (whatsappField && !whatsappField.value) {
          whatsappField.value = app.currentUser.whatsapp;
        }
      }
    }, 100);
  }
});
