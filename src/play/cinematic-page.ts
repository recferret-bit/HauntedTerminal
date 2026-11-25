import { startPageAudio } from '../audio/page.js';
import { bootCinematicPreview } from '../cinematic/preview.js';

const params = new URLSearchParams(location.search);
const silent = params.get('muted') === '1' || params.get('mute') === '1';
const audio = silent ? null : startPageAudio(null, document);
bootCinematicPreview(audio?.bus ?? null);
