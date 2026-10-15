import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  initializeFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCWvwOLh-WlYrX9HVP5lvJ8qrSj-UgTnls",
  authDomain: "pwa-tareas-app.firebaseapp.com",
  projectId: "pwa-tareas-app",
  storageBucket: "pwa-tareas-app.firebasestorage.app",
  messagingSenderId: "571806150356",
  appId: "1:571806150356:web:dd6ae83926d41c104a5541"
};

// Inicialización de la App
const app = initializeApp(firebaseConfig);

// Inicialización correcta de Firestore con Persistencia Multipestaña
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);

// Configurar persistencia de autenticación en el navegador
setPersistence(auth, browserLocalPersistence).catch(err => console.log("Error Persistencia Auth:", err));

const tasksRef = collection(db, "tareas");

// Referencias a elementos del DOM
const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const appContainer = document.getElementById('appContainer');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');

const regName = document.getElementById('regName');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const registerError = document.getElementById('registerError');

const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userDisplay = document.getElementById('userDisplay');

const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');

let currentUser = null;
let unsubscribeListener = null;

// --- CONTROL DE VISTAS (Navegación) ---
showRegisterBtn.addEventListener('click', () => {
  loginCard.style.display = 'none';
  registerCard.style.display = 'block';
  loginError.textContent = '';
});

showLoginBtn.addEventListener('click', () => {
  registerCard.style.display = 'none';
  loginCard.style.display = 'block';
  registerError.textContent = '';
});

// --- CARGA INSTANTÁNEA AL ABRIR LA APP (Mantiene UI lista) ---
const cachedUid = localStorage.getItem('pwa_user_uid');
const cachedName = localStorage.getItem('pwa_user_name');

if (cachedUid) {
  currentUser = { uid: cachedUid, displayName: cachedName };
  if (userDisplay) userDisplay.textContent = cachedName;
  
  loginCard.style.display = 'none';
  registerCard.style.display = 'none';
  appContainer.style.display = 'block';

  renderCachedTasks();
}

function renderCachedTasks() {
  const localTasks = JSON.parse(localStorage.getItem('pwa_cached_tasks') || '[]');
  taskList.innerHTML = '';
  localTasks.forEach((item) => {
    createTaskElement(item.text, item.id);
  });
}

// --- MANEJO DE AUTENTICACIÓN ---

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  if (!navigator.onLine) {
    loginError.textContent = "Sin conexión a internet. Para iniciar sesión necesitas estar en línea.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value.trim());
  } catch (error) {
    console.error("Error Login:", error);
    loginError.textContent = "Correo o contraseña incorrectos.";
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';

  if (!navigator.onLine) {
    registerError.textContent = "Sin conexión a internet. Para registrarte necesitas estar en línea.";
    return;
  }

  const name = regName.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value.trim();

  if (!name) {
    registerError.textContent = "Por favor ingresa tu nombre completo.";
    return;
  }

  if (password.length < 6) {
    registerError.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    if (userDisplay) userDisplay.textContent = name;
  } catch (error) {
    console.error("Error Registro:", error);
    if (error.code === 'auth/email-already-in-use') {
      registerError.textContent = "Este correo ya está registrado. Intenta iniciar sesión.";
    } else {
      registerError.textContent = "Error al registrar: " + error.message;
    }
  }
});

// Cerrar Sesión Explícito
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('pwa_user_uid');
  localStorage.removeItem('pwa_user_name');
  localStorage.removeItem('pwa_cached_tasks');
  currentUser = null;
  if (unsubscribeListener) unsubscribeListener();
  
  signOut(auth).then(() => {
    loginCard.style.display = 'block';
    registerCard.style.display = 'none';
    appContainer.style.display = 'none';
    taskList.innerHTML = '';
  });
});

// Listener de Estado de Autenticación
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    const nameToShow = user.displayName || user.email.split('@')[0];

    localStorage.setItem('pwa_user_uid', user.uid);
    localStorage.setItem('pwa_user_name', nameToShow);

    if (userDisplay) userDisplay.textContent = nameToShow;

    loginCard.style.display = 'none';
    registerCard.style.display = 'none';
    appContainer.style.display = 'block';

    loginEmail.value = '';
    loginPassword.value = '';
    regName.value = '';
    regEmail.value = '';
    regPassword.value = '';

    listenToUserTasks(user.uid);
  } else {
    // Si ya existe sesión iniciada localmente, no cerrar la vista al recargar
    if (localStorage.getItem('pwa_user_uid')) {
      return; 
    }

    currentUser = null;
    if (unsubscribeListener) unsubscribeListener();

    if (userDisplay) userDisplay.textContent = '';
    loginCard.style.display = 'block';
    registerCard.style.display = 'none';
    appContainer.style.display = 'none';
    taskList.innerHTML = '';
  }
});

// --- OPERACIONES DE TAREAS ---

addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });

async function addTask() {
  const text = taskInput.value.trim();
  if (text === '' || !currentUser) return;

  const tempId = 'temp_' + Date.now();

  // 1. Renderizado instantáneo en la pantalla
  createTaskElement(text, tempId);
  taskInput.value = '';

  // 2. Guardar en copia local (localStorage)
  const localTasks = JSON.parse(localStorage.getItem('pwa_cached_tasks') || '[]');
  localTasks.push({ id: tempId, text: text, userId: currentUser.uid, createdAt: Date.now() });
  localStorage.setItem('pwa_cached_tasks', JSON.stringify(localTasks));

  // 3. Enviar a Firestore
  try {
    await addDoc(tasksRef, {
      text: text,
      userId: currentUser.uid,
      createdAt: Date.now()
    });
  } catch (error) {
    console.log("Guardado localmente. Se sincronizará al volver online:", error);
  }
}

function listenToUserTasks(uid) {
  if (unsubscribeListener) unsubscribeListener();

  const q = query(tasksRef, where("userId", "==", uid));

  unsubscribeListener = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const docs = [];
    snapshot.forEach((docSnapshot) => {
      docs.push({ id: docSnapshot.id, ...docSnapshot.data() });
    });

    docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Guardar copia local exacta (vacía [] o con tareas)
    localStorage.setItem('pwa_cached_tasks', JSON.stringify(docs));

    // Limpieza forzada del DOM y renderizado
    taskList.innerHTML = '';
    docs.forEach((item) => {
      createTaskElement(item.text, item.id);
    });
  }, (error) => {
    console.error("Error en Snapshot:", error);
    renderCachedTasks();
  });
}

function createTaskElement(text, id) {
  const li = document.createElement('li');
  li.id = `task-${id}`;
  
  const span = document.createElement('span');
  span.textContent = text;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'X';
  deleteBtn.classList.add('delete-btn');
  deleteBtn.addEventListener('click', async () => {
    // Eliminar visualmente del DOM de inmediato
    li.remove();

    // Actualizar localStorage quitando esta tarea
    const localTasks = JSON.parse(localStorage.getItem('pwa_cached_tasks') || '[]');
    const updatedTasks = localTasks.filter(item => item.id !== id);
    localStorage.setItem('pwa_cached_tasks', JSON.stringify(updatedTasks));

    // Eliminar de Firestore si no es un ID temporal
    try {
      if (!id.startsWith('temp_')) {
        await deleteDoc(doc(db, "tareas", id));
      }
    } catch (e) {
      console.log("Eliminado en modo offline");
    }
  });

  li.appendChild(span);
  li.appendChild(deleteBtn);
  taskList.appendChild(li);
}