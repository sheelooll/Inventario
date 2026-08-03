import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

export const FB_API_KEY = 'AIzaSyD5a32rqqGt95q-Ft2LBLXwuWIgd_JbJzI';

const firebaseConfig = {
  apiKey:            FB_API_KEY,
  authDomain:        'inventario-nunoa.firebaseapp.com',
  projectId:         'inventario-nunoa',
  messagingSenderId: '141535821145',
  appId:             '1:141535821145:web:0cc5f7c3ab24b8fad5e048',
};

const app = initializeApp(firebaseConfig);

export const db     = getFirestore(app);
export const authFB = getAuth(app);
