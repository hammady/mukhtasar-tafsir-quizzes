# إعداد المزامنة الاختيارية (Firebase)

المزامنة اختيارية، وتبقى الاختبارات تعمل بلا إنترنت في متصفح واحد مع التصدير والاستيراد. تظهر بطاقة المزامنة في الصفحة الرئيسية فقط بعد وضع إعدادات Firebase في `assets/firebase-config.json`.

1. أنشئ مشروعًا في https://console.firebase.google.com (عطّل Google Analytics).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** `www.hammady.net` (و`hammady.github.io` اختياريًا). `localhost` مضاف تلقائيًا.
4. **Build → Firestore Database → Create database** (وضع Production، أقرب منطقة لك).
5. **Firestore → Rules:** الصق محتوى `firebase/firestore.rules` ثم Publish.
6. **Project settings → General → Your apps → Web (`</>`):** سجّل تطبيقًا واحذف خيار Hosting، وانسخ كائن `firebaseConfig`.
7. انسخ `assets/firebase-config.example.json` إلى `assets/firebase-config.json` وضع القيم (هذه الإعدادات عامة بطبيعتها وليست أسرارًا).
8. موصى به: في Google Cloud Console → APIs & Services → Credentials افتح «Browser key (auto created by Firebase)» واختر Application restrictions = Websites وأضف **كل** هذه العناوين (حذف أيٍّ من `firebaseapp.com` أو `web.app` يكسر نافذة تسجيل الدخول): `https://www.hammady.net/*` و`https://hammady.github.io/*` و`https://<project-id>.firebaseapp.com/*` و`https://<project-id>.web.app/*` و`http://localhost:8765/*`. مفتاح Firebase للويب ليس سرًّا، لكن هذا القيد يمنع مواقع أخرى من استعماله. قد يستغرق التطبيق 5 دقائق.
9. `python3 tools/build.py` ثم commit وpush.

## نموذج البيانات
- كل مستخدم له **5 خانات ثابتة لكل جزء**: `users/{uid}/attempts/juz-NN_{1..5}` (150 وثيقة كحد أقصى، تفرضه قواعد Firestore).
- الوثيقة: `juz, slot, started, finished, marks, total, timeout, slots[], at`.
- حذف المحاولة يكتب علامة حذف صغيرة في خانتها (`deleted: true`) فتصل إلى الأجهزة الأخرى، ويمكن إعادة استخدام الخانة. وإن كان المستخدم غير متصل يُنفَّذ الحذف السحابي عند الاتصال التالي.
- عند دمج أجهزة يتجاوز مجموعها 5 محاولات لجزء واحد، تُحذف الأقدم.
- لا يُخزَّن اسم ولا بريد في Firestore؛ هما فقط في قائمة مستخدمي Firebase Authentication.
- الاختبارات: `node tests/sync.test.js` (Firestore وهمي في الذاكرة، جهازان).
