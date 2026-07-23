# Socket.IO multi-instance cu Redis

Suportul pentru mai multe instanțe Node.js este implementat, dar rămâne dezactivat implicit. Activează-l numai când serviciul rulează cel puțin două instanțe ale aplicației.

## Ce rezolvă

Când `SOCKET_REDIS_ADAPTER_ENABLED=true`:

- broadcast-urile Socket.IO sunt distribuite între toate instanțele prin Redis Pub/Sub;
- fiecare mutație de cameră Duel este executată sub un lock Redis per cameră;
- procesul reîncarcă ultima versiune a camerei înainte de mutație și o persistă înainte de eliberarea lock-ului;
- procesele își sincronizează cache-urile locale printr-un canal Redis separat;
- verificarea socket-urilor active și cleanup-ul camerelor folosesc toate instanțele, nu doar procesul local.

Pe o singură instanță, lasă opțiunea dezactivată. Aplicația păstrează comportamentul și costul operațional anterior.

## Configurare

Toate instanțele trebuie să folosească exact aceleași valori pentru:

```env
REDIS_URL=rediss://default:password@host:port
REDIS_KEY_PREFIX=f1guesserduel
SOCKET_REDIS_ADAPTER_ENABLED=true
SOCKET_REDIS_ADAPTER_REQUEST_TIMEOUT_MS=5000
REDIS_ROOM_LOCK_TTL_MS=15000
REDIS_ROOM_LOCK_WAIT_TIMEOUT_MS=5000
```

`SOCKET_REDIS_ADAPTER_ENABLED=true` fără `REDIS_URL` oprește pornirea cu o eroare explicită.

## Load balancer și sticky sessions

Clientul Socket.IO folosește și transportul HTTP long-polling ca fallback. Într-un deployment cu mai multe instanțe, load balancer-ul trebuie să păstreze cererile aceleiași conexiuni pe aceeași instanță, de exemplu prin cookie affinity/sticky sessions.

Adapterul Redis distribuie evenimentele între procese, dar nu înlocuiește această configurare a load balancer-ului. Alternativa este forțarea exclusivă a transportului WebSocket, însă aceasta elimină fallback-ul long-polling și trebuie testată separat în toate rețelele suportate.

## Securitate Redis

Redis trebuie tratat ca infrastructură internă de încredere:

- folosește `rediss://`/TLS când providerul îl oferă;
- activează autentificarea și ACL-uri;
- nu expune portul Redis către internet;
- folosește un prefix dedicat aplicației;
- nu partaja credentialele cu servicii neîncrezătoare.

Mesajele adapterului sunt transmise prin Pub/Sub și nu sunt semnate de Socket.IO. Accesul de publish la canalele aplicației trebuie limitat.

## Conexiuni Redis per proces

Cu funcția activă, fiecare proces folosește în mod normal patru conexiuni Redis:

1. conexiunea principală pentru camere și rate limiting;
2. publisher-ul adapterului Socket.IO;
3. subscriber-ul adapterului Socket.IO;
4. subscriber-ul pentru sincronizarea cache-ului camerelor.

Verifică limita de conexiuni a planului Redis înainte de a crește numărul de instanțe.

## Concurență și lock-uri

Lock-ul este separat pentru fiecare cameră, astfel încât două camere diferite pot fi actualizate simultan. Pentru aceeași cameră, acțiunile sunt serializate.

Valorile implicite sunt:

- TTL lock: `15000 ms`;
- așteptare maximă: `5000 ms`;
- retry intern: interval scurt până la expirarea timpului de așteptare.

Cât timp o mutație rulează, lease-ul lock-ului este reînnoit periodic. Înainte de persistare, procesul verifică din nou că deține lock-ul; dacă lease-ul a fost pierdut, modificarea este anulată și camera este reîncărcată din Redis. `REDIS_ROOM_LOCK_TTL_MS` trebuie totuși păstrat suficient de mare pentru a tolera întârzieri temporare ale event loop-ului sau Redis.

Dacă lock-ul nu poate fi obținut la timp, acțiunea este refuzată cu un mesaj de retry în loc să suprascrie starea unei alte instanțe.

## Comportament la probleme Redis

Pornirea este fail-fast: dacă adapterul este activat și conexiunile Redis nu pot fi inițializate, procesul nu pornește.

În timpul rulării:

- o eroare la persistarea camerei oprește mutația și păstrează eroarea în health/metrics;
- o eroare de publicare pe canalul auxiliar de sincronizare este logată, dar nu anulează o stare deja persistată;
- TTL-ul lock-ului împiedică blocarea permanentă dacă un proces moare;
- următoarea mutație reîncarcă starea autoritară din Redis.

## Pași de activare

1. Creează Redis privat și verifică numărul permis de conexiuni.
2. Configurează toate instanțele cu același `REDIS_URL` și `REDIS_KEY_PREFIX`.
3. Activează sticky sessions în load balancer.
4. Setează `SOCKET_REDIS_ADAPTER_ENABLED=true` pe toate instanțele în același rollout.
5. Testează cu două browsere direcționate către instanțe diferite:
   - join în aceeași cameră;
   - schimbarea setărilor lobby;
   - guess simultan;
   - disconnect/reconnect;
   - room list și cleanup.
6. Urmărește logurile pentru lock timeout, erori Redis și health `degraded`.

## Rollback

Revino temporar la o singură instanță și setează:

```env
SOCKET_REDIS_ADAPTER_ENABLED=false
```

Nu rula două instanțe cu această opțiune dezactivată: broadcast-urile și mutațiile camerelor nu vor mai fi coordonate între procese.
