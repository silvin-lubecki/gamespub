// Coquille commune : accueil, solo, salon, partie, fin, règles (common/ui/shell.js).
import { startShell } from '../common/ui/shell.js';
import { game } from './game.js';
import { VERSION } from './version.js';

startShell(game, { version: VERSION });
