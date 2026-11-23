# EDUVERSE Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Role Immutability**: Pengguna tidak dapat mengubah atau menaikkan `role` miliknya sendiri (`siswa` -> `guru` atau `super_admin`). Hanya admin tepercaya (`isAdmin()`) yang dapat mempromosikan/mengubah peran pengguna.
2. **PII Isolation**: Email, nomor identitas (NIS/NIP), dan data sekolah disimpan di `/users/{userId}/private/{docId}` dan hanya dapat dibaca oleh pemilik (`userId == request.auth.uid`) atau admin.
3. **Answer Key Separation**: Dokumen pada `/answerKeys/{questionId}` DILARANG KERAS dibaca (`get` atau `list`) maupun ditulis oleh siswa. Hanya guru pemilik (`teacherId == request.auth.uid`) atau admin yang dapat mengaksesnya.
4. **Teacher Ownership**: Guru hanya dapat mengelola `/classes/{classId}`, `/questionBanks/{bankId}`, `/questions/{questionId}`, `/answerKeys/{questionId}`, dan `/gameSessions/{sessionId}` milik dirinya sendiri (`teacherId == request.auth.uid`).
5. **Relational & Referential Integrity**: Setiap `questions`, `answerKeys`, dan `gameSessions` wajib merujuk pada `bankId` atau `classId` yang benar-benar ada (`exists()`) dan dimiliki oleh guru yang sama. Untuk `playerStates`, `sessionId` wajib merujuk pada `gameSessions` yang ada atau sesi bawaan terverifikasi (`sess_edu101`, `sess_fis202`), serta field opsional `skinId` divalidasi dengan daftar skin resmi.
6. **Terminal State Locking**: Sesi berstatus `'ended'` atau progres berstatus `'completed'` tidak dapat diubah lagi oleh pengguna non-admin.
7. **Temporal & Schema Integrity**: `createdAt` dan `updatedAt` divalidasi dengan `request.time`. Semua string memiliki batas `.size()` dan ID mematuhi regex `^[a-zA-Z0-9_\-]+$`.
8. **Secure List Queries**: Setiap aturan `allow list` mengevaluasi `resource.data` secara eksplisit tanpa memanggil `get()`/`exists()` untuk mencegah kebocoran kueri maupun biaya baca O(n).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Role Escalation (Create)**: `users/u_evil` mencoba membuat profil dengan `role: "super_admin"` (ditolak).
2. **Self-Role Escalation (Update)**: `users/u_student` mencoba `update({ role: "guru" })` (ditolak).
3. **PII Scrape**: `u_other` mencoba `get` `/users/u_victim/private/info` (ditolak).
4. **Student Reading AnswerKey**: `u_student` mencoba `get` atau `list` `/answerKeys/{qId}` (ditolak).
5. **Student Forging Question**: `u_student` mencoba `create` di `/questions/{qId}` (ditolak).
6. **Cross-Teacher Session Hijack**: `u_teacher_B` mencoba `update` sesi milik `u_teacher_A` (ditolak).
7. **Shadow Field Injection**: Payload menyisipkan field liar `isVerified: true` atau `bypassRule: true` pada `gameSessions` (ditolak oleh `keys().hasOnly(...)`).
8. **ID Poisoning**: Dokumen dibuat dengan ID sepanjang 500 karakter atau karakter `../admin` (ditolak oleh `isValidId`).
9. **Client Timestamp Forgery**: Payload mengirim `createdAt: "2020-01-01T00:00:00Z"` bukannya `request.time` (ditolak).
10. **Terminal State Reopen**: Siswa mencoba mengubah `studentProgress` dengan `status: "completed"` kembali menjadi `"active"` (ditolak).
11. **Unverified Email Spoofing**: Token dengan `email_verified: false` mencoba menulis ke koleksi guru/admin (ditolak).
12. **Blanket List Scraping**: Kueri `list` ke `/submissions` tanpa filter kepemilikan oleh pengguna asing (ditolak oleh `resource.data`).
