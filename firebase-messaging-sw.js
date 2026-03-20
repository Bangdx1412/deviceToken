importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Khởi tạo Firebase SDK v10 (Compat version cho Service Worker)
firebase.initializeApp({
  apiKey: "AIzaSyDB_tuKO7XRfDY6g6IlNskSoMI_4Nfeips",
  authDomain: "bitb-notification-a.firebaseapp.com",
  databaseURL: "https://bitb-notification-a-default-rtdb.firebaseio.com",
  projectId: "bitb-notification-a",
  storageBucket: "bitb-notification-a.firebasestorage.app",
  messagingSenderId: "919555812573",
  appId: "1:919555812573:web:bc2d09a937d344a15c3f34"
});

const messaging = firebase.messaging();

// -----------------------------------------------------------------
// LẮNG NGHE THÔNG BÁO KHI ĐÓNG TAB HOẶC ẨN TRÌNH DUYỆT (BACKGROUND)
// -----------------------------------------------------------------
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Nhận thông báo Background: ', payload);
  
  const notificationTitle = payload.notification?.title || 'Thông báo từ BitB';
  const notificationOptions = {
    body: payload.notification?.body || 'Bạn có một thông báo mới.',
    data: payload.data 
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});