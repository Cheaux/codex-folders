// Render the real browser layout with wholly fictional data.
import { writeFileSync } from 'node:fs';
import { renderBrowser } from '../src/browser-view.js';
const escape = (value: string) => value.replace(/[&<>\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]!));
const folder = (id: string,name: string,isProject = false,parentId: string | null = null) => ({id,name,isProject,parentId,instructions:'',defaultCwd:null});
const website=folder('fixture-website','Website',true);
const research=folder('fixture-research','Research',true);
const chats=['Plan the product website','Choose an authentication flow','Review the accessibility checklist'].map((title,index)=>({id:`fixture-chat-${index}`,title,cwd:'/projects/website',updatedAt:0,archived:false,missing:false,indexedAt:0,folderId:website.id}));
const state={columns:110,rows:27,tree:[{id:'all',label:'All chats'},{id:website.id,label:'▾ Website',folder:website},{id:'fixture-design',label:'  Design',folder:folder('fixture-design','Design',false,website.id)},{id:research.id,label:'Research',folder:research},{id:'new-folder',label:'+ New folder'}],folderIndex:1,focus:'chats' as const,view:website.id,viewName:'Website',chats,cursor:0,selected:[],query:'',message:'',folderCount:3,currentLocation:'Website · /projects/website',color:false};
const lines=renderBrowser(state).split('\n');
const frame=lines.map((line,index)=>`<text x="27" y="${92+index*27}" xml:space="preserve">${escape(line)}</text>`).join('\n');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="760" viewBox="0 0 1240 760"><rect width="1240" height="760" rx="14" fill="#101b20"/><path d="M0 50h1240" stroke="#365057"/><circle cx="26" cy="25" r="6" fill="#79cbb7"/><text x="48" y="31" fill="#b1c3c7" font-family="monospace" font-size="17">codex · /folders</text><rect x="367" y="180" width="810" height="27" fill="#2c4d50"/><g fill="#e1e9e8" font-family="monospace" font-size="17.5">${frame}</g><text x="48" y="722" fill="#89a5a9" font-family="monospace" font-size="15">Synthetic demo · Codex Folders v0.1.0 · github.com/Cheaux/codex-folders</text></svg>`;
writeFileSync('docs/assets/folders-demo.svg',svg);
const social=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#162c30"/><path d="M72 66h72l24 24h94v100H72z" fill="#8ee0ce"/><text x="72" y="290" fill="#f1f8f6" font-size="78" font-weight="bold" font-family="sans-serif">Codex Folders</text><text x="76" y="355" fill="#bfe2d8" font-size="34" font-family="sans-serif">Folders for your Codex CLI chats.</text><text x="76" y="416" fill="#f1f8f6" font-size="27" font-family="monospace">/folders   ·   New chats   ·   Shared project memory</text><path d="M76 477h1048" stroke="#436265"/><text x="76" y="542" fill="#a7c3bd" font-size="27" font-family="sans-serif">Open source · MIT · github.com/Cheaux/codex-folders</text></svg>`;
writeFileSync('docs/assets/social-card.svg',social);
console.log('Rendered fictional browser layout and social card SVGs.');
