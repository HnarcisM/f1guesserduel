# 🏎️ F1 Guesser - Duel Multiplayer

Un joc web interactiv de tip Wordle inspirat din Formula 1, unde te poți duela în timp real cu un prieten pentru a ghici pilotul misterios. Proiectul folosește **Node.js**, **Express** și **Socket.io** pentru sincronizarea multiplayer și actualizări instantanee în grilă.

🛠️ Tehnologii Utilizate
Backend: Node.js și Express Framework pentru rutare și servirea fișierelor statice.

Sincronizare în timp real: Socket.io pentru gestionarea camerelor și comunicarea bidirecțională rapidă.

Frontend: HTML5 pur, CSS3 (folosind proprietăți personalizate --variables pentru teme) și JavaScript (Vanilla JS cu WebSockets și LocalStorage).

⚙️ Instalare și Pornire Rapidă
Metoda 1: Lansare Rapidă pe Windows (Recomandat)
Dacă ești pe Windows, tot ce trebuie să faci este să rulezi fișierul .bat din folderul rădăcină:

Dublu-clic pe F1GuesserDuel.bat.

Scriptul va verifica automat dacă folderul node_modules există. Dacă nu, va descărca automat dependințele rulând npm install.

Serverul va porni singur pe portul 3000.


## 🚀 Funcționalități

* **Duel în timp real:** Creează o cameră de joc, trimite link-ul unui prieten și jucați simultan.
* **Trei niveluri de dificultate:**
  * **Easy:** Piloți activi sau recenți după anul 2010.
  * **Medium:** Epoca motoarelor V10 și V8 (anii 2000 - 2010).
  * **Hard:** Panteonul istoric al Formulei 1 (anii 1950 - 2000).
* **Sugestii inteligente:** Sistem de autocompletare la tastare pentru a asigura selectarea unui pilot valid din baza de date.
* **Sistem de indicii pe culori:** Fiecare încercare oferă indicii vizuale despre țară, echipă, vârstă, anul debutului și numărul de victorii ale pilotului țintă.

---

## 📂 Structura Proiectului

```text
[Folderul_Proiectului]
 ├── server.js            # Serverul principal Node.js / Socket.io
 ├── drivers.json         # Baza de date cu piloții F1 și atributele lor
 ├── .gitignore           # Fișierul care ascunde node_modules de GitHub
 ├── README.md            # Documentația proiectului (acest fișier)
 └── [public]             # Folderul pentru fișierele statice accesate de browser
      ├── index.html      # Interfața vizuală a jocului
      └── game.js         # Logica din browser și legarea evenimentelor

💡 Legendă Culori (Indicii)
🟩 Verde: Potrivire perfectă.
🟨 Galben: Echipa introdusă se află în istoricul fostelor echipe ale pilotului.
🟧 Portocaliu: Valoarea corectă este mai mare decât cea introdusă.
🟪 Violet: Valoarea corectă este mai mică decât cea introdusă.
🟥 Roșu: Lipsă totală de potrivire.
