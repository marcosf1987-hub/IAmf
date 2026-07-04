# Lista de tareas — PromptPlay

Tareas pendientes y verificaciones operativas. Marcar con `[x]` al completar.

---

## Verificación Mundial antes del torneo

Comprobar que resultados, puntos y rankings del fútbol funcionan **antes** del primer partido. Referencia técnica: `server/src/leaderboard.ts`, `sync-match-results.ts`, `GET /results/me`, `GET /results/dashboard?discipline=football`.

### Infra y producción

- [ ] Confirmar en Railway: `FOOTBALL_DATA_API_KEY` y `FOOTBALL_DATA_AUTO_SYNC_INTERVAL_MS` (default 5 min; no usar `0` salvo sync solo manual)
- [ ] Revisar logs al arrancar el API: mensaje de auto-sync activo (no “FOOTBALL_DATA_API_KEY no definida”)
- [ ] Verificar calendario de partidos en BD tras deploy (`MATCHES_SEED` / `npm run db:seed`)

### Dry run de scoring y rankings (staging o local)

- [ ] Crear 2 usuarios en la misma empresa y misma liga Mundial, con predicciones de prueba
- [ ] Cargar resultado de un partido vía `PATCH /admin/matches/:id/result` (caso acierto exacto y caso sin acierto)
- [ ] Validar `GET /results/me`: `totalHits` e `isHit` por partido
- [ ] Validar `GET /results/dashboard?discipline=football`: puntos, precisión, ranking y tabla por liga
- [ ] Validar `GET /leaderboard`: orden por aciertos
- [ ] Probar `POST /admin/sync-match-results` (sync manual) y revisar respuesta `updated`

### Operación día 0 (primer partido)

- [ ] Monitorear logs `[football-data] Auto-sync` tras partidos finalizados
- [ ] Spot check: 2 usuarios reales en Resultados y en una liga
- [ ] Plan B documentado: `PATCH` manual de resultados si el sync no mapea (cruces / TBD)

### Mejoras de producto / calidad (post-verificación)

- [ ] Botón en Panel Admin: “Sincronizar resultados” (cliente ya expone `syncMatchResults` en `api.ts`)
- [ ] Tests automáticos: `isExactHit` + `computeLeaderboardForUsers` en `leaderboard.ts`
- [ ] Test de integración: `PATCH` resultado → `GET /results/me` / dashboard
- [ ] Script opcional: `server/scripts/football-scoring-smoke.ts` para correr en cada deploy

### Relacionado

- [ ] Validar cierre de predicciones por fase (`prode-phases`) antes del primer partido
- [ ] Fase 2 UI: Mis ligas / Resultados con paneles al estilo F1 (si sigue en roadmap)

---

## UI / producto (otros)

- [ ] _(Añadir aquí otras tareas de producto según vayan surgiendo)_
