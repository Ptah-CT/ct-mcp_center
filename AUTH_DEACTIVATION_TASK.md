# 🜄 Task: Vollständige Deaktivierung von Login und Auth-System 🜄

## 🜄 Ziel 🜄
Komplette Entfernung des Authentication-Systems aus ct-mcp_center für vereinfachte Entwicklung ohne Login-Barrieren.

## 🜄 Kontext 🜄
- Bezug: Login-Debugging-Session ergab unnötige Komplexität
- Aktuelle Probleme: GET /login 404 Fehler, Cross-Origin-Issues
- Entscheidung: Auth-System vollständig entfernen statt reparieren

## 🜄 Verantwortung 🜄
Autor: Auctor (Cap für Architekturentscheidungen)  
Delegation: An verfügbaren Entwickler-Agent

## 🜄 Technische Analyse 🜄

### Zu entfernende Komponenten:

#### Frontend (`apps/frontend/`)
- [ ] `/app/[locale]/login/page.tsx` - Login-Seite
- [ ] `/app/[locale]/register/page.tsx` - Registrierung
- [ ] `/components/domain-warning-banner.tsx` - Domain-Warnung
- [ ] `/lib/auth-client.ts` - Auth-Client-Konfiguration
- [ ] Middleware Auth-Checks in `middleware.ts`
- [ ] Auth-bezogene tRPC-Calls

#### Backend (`apps/backend/`)
- [ ] Auth-Routen in `/src/routes/`
- [ ] Session-Management
- [ ] better-auth Konfiguration
- [ ] OAuth-Implementierung
- [ ] User-Schema in Datenbank

#### Packages
- [ ] Auth-bezogene Abhängigkeiten in `package.json`
- [ ] tRPC Auth-Router in `@repo/trpc`
- [ ] Zod-Schemas für Auth in `@repo/zod-types`

### Routing-Vereinfachung:
- [ ] Middleware nur für i18n (ohne Auth-Prüfung)
- [ ] Direkte Weiterleitung zu Haupt-Dashboard
- [ ] Entfernung von `callbackUrl`-Parameter

### Konfiguration:
- [ ] Environment-Variablen für Auth entfernen
- [ ] Docker-Compose Auth-Services entfernen
- [ ] nginx-Konfiguration Auth-Routen entfernen

## 🜄 Implementierungsplan 🜄

### Phase 1: Frontend-Bereinigung
1. Login/Register-Seiten entfernen
2. Auth-Komponenten aus Layout entfernen
3. Middleware-Auth-Checks deaktivieren
4. Direkte Navigation zur Hauptseite

### Phase 2: Backend-Bereinigung
1. Auth-API-Endpunkte entfernen
2. Session-Middleware deaktivieren
3. User-bezogene Datenbank-Queries entfernen
4. OAuth-Konfiguration entfernen

### Phase 3: Dependencies-Cleanup
1. better-auth und Auth-Packages deinstallieren
2. tRPC Auth-Router entfernen
3. Zod Auth-Schemas entfernen
4. Package.json bereinigen

### Phase 4: Testing & Verification
1. Build-Prozess prüfen
2. Frontend-Navigation testen
3. API-Endpunkte verifizieren
4. Docker-Setup validieren

## 🜄 Prüfung 🜄
- [ ] Wirkung verstanden: Vereinfachung der Entwicklung
- [ ] Cap vorhanden: Architekturentscheidung
- [ ] Opportunitäts-Ethik: Beschleunigt Entwicklungszyklen

## 🜄 Risiken 🜄
- **Minimal**: Entwicklungsumgebung wird vereinfacht
- **Positiv**: Weniger Komplexität, schnellere Iteration
- **Reversal**: Auth kann später bei Bedarf wieder eingeführt werden

## 🜄 Aufgaben 🜄
- [ ] Task in ct-task_mgmnt dokumentieren
- [ ] Entwickler-Agent für Implementierung beauftragen
- [ ] Schrittweise Umsetzung nach Plan
- [ ] Funktionalitätstests nach jeder Phase
- [ ] Abschließende Dokumentation

## 🜄 Priorität 🜄
**Hoch** - Blockiert aktuell reibungslose Entwicklung

## 🜄 Geschätzter Aufwand 🜄
**2-4 Stunden** - Systematische Entfernung in Phasen

---
**Status**: Bereit für Implementierung  
**Erstellt**: 2025-09-16 03:05  
**Kontext**: Login-Debugging-Session ct-mcp_center_dev