# إعداد المزامنة الاختيارية (Firebase)

المزامنة اختيارية، وتبقى الاختبارات تعمل بلا إنترنت في متصفح واحد مع التصدير والاستيراد. تظهر بطاقة المزامنة في الصفحة الرئيسية فقط بعد وضع إعدادات Firebase في `assets/firebase-config.json`.

1. أنشئ مشروعًا في https://console.firebase.google.com (عطّل Google Analytics).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** `www.hammady.net` (و`hammady.github.io` اختياريًا). `localhost` مضاف تلقائيًا.
4. **Build → Firestore Database → Create database** (وضع Production، أقرب منطقة لك).
5. **Firestore → Rules:** الصق محتوى `firebase/firestore.rules` ثم Publish.
6. **Project settings → General → Your apps → Web (`</>`):** سجّل تطبيقًا واحذف خيار Hosting، وانسخ كائن `firebaseConfig`.
7. انسخ `assets/firebase-config.example.json` إلى `assets/firebase-config.json` وضع القيم (هذه الإعدادات عامة بطبيعتها وليست أسرارًا).
8. اختياري: في Google Cloud Console → APIs & Services → Credentials قيّد مفتاح API بالنطاقات `www.hammady.net/*` و`hammady.github.io/*`.
9. `python3 tools/build.py` ثم commit وpush.

## نموذج البيانات
`users/{uid}/attempts/{juz}_{started}` وثيقة لكل محاولة: `juz, started, finished, marks, total, timeout, slots[], at`.
لا يُخزَّن اسم ولا بريد في Firestore؛ هما فقط في قائمة مستخدمي Firebase Authentication.
