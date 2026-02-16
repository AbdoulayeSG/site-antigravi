// Application State with Firebase
const app = {
  currentUser: null,
  currentView: 'home',
  editingProductId: null,
  useFirebase: false, // Set to true when Firebase is configured

  // Initialize app
  init() {
    // Check if Firebase is configured
    this.checkFirebaseConfig();

    if (this.useFirebase) {
      this.initFirebase();
    } else {
      this.initLocalStorage();
    }

    this.updateNavigation();
    this.loadProducts();
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
        this.showMessage('Mode LocalStorage - Les données ne sont visibles que localement. Configurez Firebase pour synchronisation multi-appareils.', 'warning');
      }
    } catch (e) {
      console.warn('⚠️ Firebase non disponible - Mode LocalStorage');
    }
  },

  initFirebase() {
    const { auth } = window.firebase;
    const { onAuthStateChanged } = window.firebase.authMethods;

    // Listen to auth state changes
    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        this.loadFirebaseUserData(firebaseUser.uid);
      } else {
        this.currentUser = null;
        this.updateNavigation();
      }
    });

    // Listen to products changes
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
        this.currentUser = { uid, ...userSnapshot.val() };
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

  // Local Storage helpers (fallback)
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
    }
  },

  // Authentication
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
    const { createUserWithEmailAndPassword } = window.firebase.authMethods;
    const { ref, set } = window.firebase.dbMethods;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Save user data to database
      await set(ref(database, `users/${uid}`), {
        name,
        email,
        whatsapp,
        createdAt: new Date().toISOString()
      });

      this.currentUser = { uid, name, email, whatsapp };
      this.showMessage(`Compte créé avec succès ! Bienvenue ${name} !`, 'success');
      this.updateNavigation();
      this.showView('dashboard');
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
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    this.showMessage('Compte créé avec succès !', 'success');

    this.currentUser = newUser;
    localStorage.setItem('marketplace_current_user', email);

    this.updateNavigation();
    this.showView('dashboard');
    this.loadUserProducts();
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
      // User data will be loaded by onAuthStateChanged
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

    this.currentUser = user;
    localStorage.setItem('marketplace_current_user', email);

    this.showMessage(`Bienvenue ${user.name} !`, 'success');
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

  // Navigation
  updateNavigation() {
    const nav = document.getElementById('nav');

    if (this.currentUser) {
      nav.innerHTML = `
        <button class="btn btn-secondary" onclick="app.showView('dashboard')">
          📊 Mon Espace
        </button>
        <button class="btn btn-secondary" onclick="app.showView('home')">
          🏠 Catalogue
        </button>
        <button class="btn btn-secondary" onclick="app.logout()">
          🚪 Déconnexion
        </button>
      `;

      const userName = document.getElementById('user-name-display');
      const userWhatsApp = document.getElementById('user-whatsapp-display');
      if (userName) userName.textContent = this.currentUser.name;
      if (userWhatsApp) userWhatsApp.textContent = `📱 ${this.currentUser.whatsapp}`;
    } else {
      nav.innerHTML = `
        <button class="btn btn-secondary" onclick="app.showView('login')">
          Se Connecter
        </button>
        <button class="btn btn-primary" onclick="app.showView('register')">
          Créer un Compte
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
        this.loadUserProducts();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  // Product Management
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

      this.renderProducts(products);
    } catch (error) {
      console.error('Error loading products:', error);
      this.renderProducts([]);
    }
  },

  loadProductsLocalStorage() {
    const products = this.getProducts();
    this.renderProducts(products);
  },

  renderProducts(products) {
    const container = document.getElementById('home-products');

    if (products.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
          <p style="font-size: 1.2rem;">Aucun produit disponible pour le moment</p>
          <p style="margin-top: 1rem;">Soyez le premier à ajouter un produit !</p>
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

    return `
      <div class="product-card">
        <img src="${product.image || 'https://via.placeholder.com/300x220?text=Produit'}" 
             alt="${product.name}" 
             class="product-image">
        <div class="product-info">
          <h3 class="product-title">${this.escapeHtml(product.name)}</h3>
          <p class="product-description">${this.escapeHtml(product.description)}</p>
          <div class="product-price">${this.formatPrice(product.price)} FCFA</div>
          <div class="product-seller">Vendu par ${this.escapeHtml(sellerName)}</div>
          <button class="btn btn-success" style="width: 100%;" onclick="app.orderViaWhatsApp('${product.id}')">
            💬 Commander via WhatsApp
          </button>
        </div>
      </div>
    `;
  },

  renderMyProductItem(product) {
    return `
      <div class="my-product-item">
        <img src="${product.image || 'https://via.placeholder.com/100?text=Produit'}" 
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
        </div>
        <div class="my-product-actions">
          <button class="btn btn-secondary" onclick="app.editProduct('${product.id}')">
            ✏️ Modifier
          </button>
          <button class="btn btn-danger" onclick="app.deleteProduct('${product.id}')">
            🗑️ Supprimer
          </button>
        </div>
      </div>
    `;
  },

  async saveProduct(event) {
    event.preventDefault();

    if (!this.currentUser) {
      this.showMessage('Vous devez être connecté', 'error');
      return;
    }

    const name = document.getElementById('product-name').value.trim();
    const description = document.getElementById('product-description').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const whatsapp = document.getElementById('product-whatsapp').value.trim();
    const imagePreview = document.getElementById('preview-img');
    const image = imagePreview.src && imagePreview.src.startsWith('data:') ? imagePreview.src : null;

    if (this.useFirebase) {
      await this.saveProductFirebase(name, description, price, whatsapp, image);
    } else {
      this.saveProductLocalStorage(name, description, price, whatsapp, image);
    }
  },

  async saveProductFirebase(name, description, price, whatsapp, image) {
    const { database } = window.firebase;
    const { ref, set, push, update } = window.firebase.dbMethods;

    const productData = {
      userId: this.currentUser.uid,
      sellerName: this.currentUser.name,
      name,
      description,
      price,
      whatsapp,
      image,
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

  saveProductLocalStorage(name, description, price, whatsapp, image) {
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
          image: image || products[index].image,
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
        image,
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
    document.getElementById('image-preview').style.display = 'none';
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

    if (product.image) {
      const preview = document.getElementById('image-preview');
      const previewImg = document.getElementById('preview-img');
      previewImg.src = product.image;
      preview.style.display = 'block';
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

  previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('image-preview');
      const previewImg = document.getElementById('preview-img');
      previewImg.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  },

  // WhatsApp Integration
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

  // Utilities
  showMessage(text, type = 'success') {
    const container = document.getElementById('message-container');
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;

    container.appendChild(message);

    setTimeout(() => {
      message.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => message.remove(), 300);
    }, 4000);
  },

  formatPrice(price) {
    return new Intl.NumberFormat('fr-FR').format(price);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Add fadeOut animation
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Pre-fill WhatsApp number when showing add product view
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
