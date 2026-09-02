// ─────────────────────────────────────────────────────────────
// BETCLIC — LDC GROUPES
// Chaque soir de Ligue des Champions : 5 cotes par match.
// Les membres composent une sélection de 5 cotes parmi l'ensemble.
// Barème par difficulté : 🟢 Facile 2 pts · 🟡 Moyen 4 pts · 🔴 Difficile 8 pts
// Classement au cumul des points des cotes validées.
// ─────────────────────────────────────────────────────────────
require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const fs = require('fs');

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException',  (err) => console.error('[uncaughtException]', err));

const DATA_PATH = process.env.DATA_PATH || './ldc-data.json';
const ADMIN_LOG_CHANNEL = process.env.ADMIN_LOG_CHANNEL || '';
const MAX_PICKS = parseInt(process.env.MAX_PICKS || '5', 10);
const COLOR = '#E10014';

// Barème par position de la cote dans le match
const TIERS = [
  { emoji: '🟢', label: 'Facile',    pts: 2 },
  { emoji: '🟢', label: 'Facile',    pts: 2 },
  { emoji: '🟡', label: 'Moyen',     pts: 4 },
  { emoji: '🟡', label: 'Moyen',     pts: 4 },
  { emoji: '🔴', label: 'Difficile', pts: 8 },
];

// ── DONNÉES ──
function loadData() {
  if (!fs.existsSync(DATA_PATH)) return { sessions: {}, picks: {}, results: {} };
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); }
  catch { return { sessions: {}, picks: {}, results: {} }; }
}
function saveData(d) { fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2)); }

// ── PARSING : "Équipe A vs Équipe B = cote1 | cote2 | cote3 | cote4 | cote5" ──
function parseMatch(str) {
  const eq = str.indexOf('=');
  if (eq === -1) return { error: 'Format attendu : `Équipe A vs Équipe B = cote1 | cote2 | cote3 | cote4 | cote5`' };
  const title = str.slice(0, eq).trim();
  const parts = str.slice(eq + 1).split('|').map(s => s.trim()).filter(Boolean);
  if (!title) return { error: 'Titre du match manquant avant le `=`.' };
  if (parts.length !== 5) return { error: `5 cotes attendues (2 faciles, 2 moyennes, 1 difficile), ${parts.length} trouvée(s).` };

  const cotes = parts.map((p, i) => {
    // Cote Betclic optionnelle : dernier ":" suivi d'un nombre → "Plus de 1.5 buts:1.35"
    let label = p, odds = null;
    const idx = p.lastIndexOf(':');
    if (idx !== -1) {
      const tail = p.slice(idx + 1).trim();
      if (/^[0-9]+([.,][0-9]+)?$/.test(tail)) {
        const v = parseFloat(tail.replace(',', '.'));
        if (!isNaN(v)) { label = p.slice(0, idx).trim(); odds = v; }
      }
    }
    if (!label) return null;
    return { label, odds, pts: TIERS[i].pts };
  });
  if (cotes.some(c => c === null)) return { error: 'Une cote a un libellé vide.' };
  return { title, cotes };
}

// ── HELPERS ──
const pickId = (m, c) => `${m}-${c}`;
function userPicks(d, uid, sid) { return d.picks[uid]?.[sid]?.selection || []; }
function isValidated(d, uid, sid) { return !!d.picks[uid]?.[sid]?.validatedAt; }

function progressBar(n, max) {
  return '●'.repeat(n) + '○'.repeat(Math.max(0, max - n));
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function scoreUser(d, s, sid, uid) {
  const sel = userPicks(d, uid, sid);
  const res = d.results[sid] || [];
  let total = 0, hits = 0;
  for (const p of sel) {
    const [mi, ci] = p.split('-').map(Number);
    const cote = s.matches[mi]?.cotes[ci];
    if (!cote) continue;
    if (res.includes(p)) { total += cote.pts; hits++; }
  }
  return { total, hits, picked: sel.length };
}

// ── EMBEDS ──
function buildPublicEmbed(s) {
  const close = new Date(s.closeAt);
  const nbCotes = s.matches.length * 5;
  const list = s.matches.map((m, i) => `**${i + 1}.** ${m.title}`).join('\n');
  const e = new EmbedBuilder()
    .setTitle(s.name)
    .setDescription(
      `**Compose ta sélection de ${MAX_PICKS} cotes parmi les ${nbCotes} de la soirée.**\n` +
      `Tu piges où tu veux, autant de cotes que tu veux sur un même match.\n\n` +
      `**Barème**\n` +
      `🟢 Facile · **2 pts**\n` +
      `🟡 Moyen · **4 pts**\n` +
      `🔴 Difficile · **8 pts**\n\n` +
      `Chaque cote qui passe rapporte ses points. Jusqu'à **${MAX_PICKS * 8} pts** sur la soirée.\n\n` +
      `**Les matchs**\n${list}\n\n` +
      `⚠️ Sélection définitive une fois validée\n\n` +
      `⏰ Fermeture : <t:${Math.floor(close.getTime() / 1000)}:F>`
    )
    .setColor(COLOR);
  if (s.image) e.setImage(s.image);
  return e;
}

function buildMatchEmbed(d, s, sid, uid, mi, warning) {
  const m = s.matches[mi];
  const sel = userPicks(d, uid, sid);
  const res = d.results[sid] || [];
  const done = s.closed;

  const lines = m.cotes.map((c, ci) => {
    const id = pickId(mi, ci);
    const on = sel.includes(id);
    const t = TIERS[ci];
    const odds = c.odds ? ` *(cote ${c.odds})*` : '';
    let mark = on ? ' ✅' : '';
    if (done && res.length) mark = res.includes(id) ? ' 🎯' : (on ? ' ❌' : '');
    return `${t.emoji} **${c.label}**${odds}\n\u2003└ ${t.label} · **${c.pts} pts**${mark}`;
  });

  const perMatch = sel.filter(p => p.startsWith(`${mi}-`)).length;

  const e = new EmbedBuilder()
    .setTitle(`${m.title}`)
    .setDescription(
      (warning ? `⚠️ ${warning}\n\n` : '') +
      `Match **${mi + 1}/${s.matches.length}**${perMatch ? ` · ${perMatch} cote${perMatch > 1 ? 's' : ''} prise${perMatch > 1 ? 's' : ''} ici` : ''}\n\n` +
      lines.join('\n\n') +
      `\n\n━━━━━━━━━━━━━━━\n**${progressBar(sel.length, MAX_PICKS)}  ${sel.length}/${MAX_PICKS} sélections**`
    )
    .setColor(sel.length === MAX_PICKS ? '#00C853' : COLOR);
  if (s.image) e.setThumbnail(s.image);
  return e;
}

function buildMatchRows(d, s, sid, uid, mi) {
  const m = s.matches[mi];
  const sel = userPicks(d, uid, sid);

  const cotes = new ActionRowBuilder().addComponents(
    ...m.cotes.map((c, ci) => {
      const id = pickId(mi, ci);
      const on = sel.includes(id);
      return new ButtonBuilder()
        .setCustomId(`ldc:pick:${sid}:${mi}:${ci}`)
        .setLabel(truncate(`${on ? '✓ ' : ''}${c.label}`, 40))
        .setEmoji(TIERS[ci].emoji)
        .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
    })
  );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ldc:nav:${sid}:${(mi - 1 + s.matches.length) % s.matches.length}`)
      .setLabel('Précédent').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ldc:nav:${sid}:${(mi + 1) % s.matches.length}`)
      .setLabel('Suivant').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ldc:recap:${sid}`)
      .setLabel('Ma sélection').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ldc:validate:${sid}`)
      .setLabel(sel.length === MAX_PICKS ? 'Valider' : `Valider (${sel.length}/${MAX_PICKS})`)
      .setEmoji('✅')
      .setStyle(sel.length === MAX_PICKS ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(sel.length !== MAX_PICKS),
  );

  return [cotes, nav];
}

function buildRecapEmbed(d, s, sid, uid) {
  const sel = userPicks(d, uid, sid);
  const res = d.results[sid] || [];
  const scored = res.length > 0;
  const validated = isValidated(d, uid, sid);

  let body;
  if (!sel.length) {
    body = '*Aucune cote sélectionnée pour le moment.*';
  } else {
    const blocks = [];
    s.matches.forEach((m, mi) => {
      const mine = m.cotes.map((c, ci) => ({ c, ci, id: pickId(mi, ci) })).filter(x => sel.includes(x.id));
      if (!mine.length) return;
      const lines = mine.map(({ c, ci, id }) => {
        const t = TIERS[ci];
        let icon = '✔️';
        if (scored) icon = res.includes(id) ? '🎯' : '❌';
        const odds = c.odds ? ` *(cote ${c.odds})*` : '';
        return `${icon} ${t.emoji} ${c.label}${odds} · **${c.pts} pts**`;
      });
      blocks.push(`**${m.title}**\n${lines.join('\n')}`);
    });
    body = blocks.join('\n\n');
  }

  const { total, hits } = scoreUser(d, s, sid, uid);
  const footer = scored
    ? `\n\n━━━━━━━━━━━━━━━\n🏆 **${total} pts** · ${hits}/${sel.length} cotes passées`
    : `\n\n━━━━━━━━━━━━━━━\n**${progressBar(sel.length, MAX_PICKS)}  ${sel.length}/${MAX_PICKS} sélections**` +
      (validated ? '\n🔒 Sélection validée' : (sel.length === MAX_PICKS ? '\n✅ Prêt à valider' : ''));

  return new EmbedBuilder()
    .setTitle('📋 Ma sélection')
    .setDescription(body + footer)
    .setColor(validated || scored ? '#00C853' : COLOR);
}

function buildRecapRows(d, s, sid, uid) {
  if (s.closed || isValidated(d, uid, sid)) return [];
  const sel = userPicks(d, uid, sid);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ldc:nav:${sid}:0`)
      .setLabel('Revenir aux matchs').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ldc:validate:${sid}`)
      .setLabel(sel.length === MAX_PICKS ? 'Valider ma sélection' : `Valider (${sel.length}/${MAX_PICKS})`)
      .setEmoji('✅')
      .setStyle(sel.length === MAX_PICKS ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(sel.length !== MAX_PICKS),
  )];
}

// ── AUTO-CLOSE ──
function scheduleClose(client, sid) {
  const d = loadData();
  const s = d.sessions[sid];
  if (!s || s.closed) return;
  const delay = new Date(s.closeAt).getTime() - Date.now();
  if (delay <= 0) return;
  setTimeout(async () => {
    try {
      const dd = loadData();
      if (!dd.sessions[sid] || dd.sessions[sid].closed) return;
      dd.sessions[sid].closed = true;
      saveData(dd);
      console.log(`🔒 Session ${sid} fermée automatiquement.`);
      const ss = dd.sessions[sid];
      const ch = await client.channels.fetch(ss.channelId);
      const msg = await ch.messages.fetch(ss.messageId);
      await msg.edit({
        embeds: [buildPublicEmbed(ss).setColor('#e74c3c').setTitle(`🔴 ${ss.name} · SÉLECTIONS FERMÉES`)],
        components: [],
      });
    } catch (e) { console.error('[AutoClose]', e.message); }
  }, delay);
}

// ── CLIENT ──
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('error', (err) => console.error('[client error]', err));
client.on('warn',  (msg) => console.warn('[client warn]', msg));

client.on('interactionCreate', async interaction => {
  try {

    // ══ SLASH COMMANDS ══
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'create-ldc') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
          return await interaction.reply({ content: '❌ Réservé aux admins.', flags: MessageFlags.Ephemeral });

        const name    = interaction.options.getString('nom');
        const closeAt = interaction.options.getString('fermeture');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const image   = interaction.options.getString('image') || null;
        const closeDate = new Date(closeAt);
        if (isNaN(closeDate.getTime()) || closeDate <= new Date())
          return await interaction.reply({ content: '❌ Date invalide. Format : `2026-09-08T18:45:00`', flags: MessageFlags.Ephemeral });

        const matches = [];
        for (let i = 1; i <= 8; i++) {
          const str = interaction.options.getString(`match${i}`);
          if (!str) continue;
          const parsed = parseMatch(str);
          if (parsed.error) return await interaction.reply({ content: `❌ Match ${i} : ${parsed.error}`, flags: MessageFlags.Ephemeral });
          matches.push({ title: parsed.title, cotes: parsed.cotes });
        }
        if (matches.length < 2)
          return await interaction.reply({ content: '❌ Il faut au moins 2 matchs.', flags: MessageFlags.Ephemeral });

        const sid = `ldc_${Date.now()}`;
        const s = { id: sid, name, matches, closeAt: closeDate.toISOString(), closed: false, channelId: channel.id, messageId: null, image };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ldc:open:${sid}`).setLabel('Composer ma sélection').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        );
        const msg = await channel.send({ embeds: [buildPublicEmbed(s)], components: [row] });
        s.messageId = msg.id;

        const d = loadData();
        d.sessions[sid] = s;
        saveData(d);
        scheduleClose(client, sid);

        if (ADMIN_LOG_CHANNEL) {
          try {
            const logCh = await client.channels.fetch(ADMIN_LOG_CHANNEL);
            await logCh.send({ embeds: [new EmbedBuilder()
              .setTitle('🆕 Session LDC créée')
              .setDescription(`**Nom :** ${name}\n**ID :** \`${sid}\`\n**Matchs :** ${matches.length} (${matches.length * 5} cotes)\n**Fermeture :** <t:${Math.floor(closeDate.getTime() / 1000)}:F>\n**Canal :** <#${channel.id}>`)
              .setColor(COLOR)] });
          } catch (e) { console.error('❌ Log admin :', e.message); }
        }

        return await interaction.reply({ content: `✅ **${name}** créée : ${matches.length} matchs, ${matches.length * 5} cotes.\nID : \`${sid}\``, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'close-ldc') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
          return await interaction.reply({ content: '❌ Réservé aux admins.', flags: MessageFlags.Ephemeral });
        const sid = interaction.options.getString('session_id');
        const d = loadData();
        const s = d.sessions[sid];
        if (!s) return await interaction.reply({ content: `❌ Session \`${sid}\` introuvable.`, flags: MessageFlags.Ephemeral });
        if (s.closed) return await interaction.reply({ content: '🔒 Déjà fermée.', flags: MessageFlags.Ephemeral });
        s.closed = true;
        saveData(d);
        try {
          const ch = await client.channels.fetch(s.channelId);
          const msg = await ch.messages.fetch(s.messageId);
          await msg.edit({ embeds: [buildPublicEmbed(s).setColor('#e74c3c').setTitle(`🔴 ${s.name} · SÉLECTIONS FERMÉES`)], components: [] });
        } catch (e) { console.error('[close-ldc]', e.message); }
        return await interaction.reply({ content: `🔒 **${s.name}** fermée.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'set-result-ldc') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
          return await interaction.reply({ content: '❌ Réservé aux admins.', flags: MessageFlags.Ephemeral });
        const sid      = interaction.options.getString('session_id');
        const matchNum = interaction.options.getInteger('match') - 1;
        const raw      = interaction.options.getString('gagnantes');
        const d = loadData();
        const s = d.sessions[sid];
        if (!s) return await interaction.reply({ content: `❌ Session \`${sid}\` introuvable.`, flags: MessageFlags.Ephemeral });
        const m = s.matches[matchNum];
        if (!m) return await interaction.reply({ content: `❌ Match ${matchNum + 1} introuvable.`, flags: MessageFlags.Ephemeral });

        const nums = raw.toLowerCase() === 'aucune' ? [] : raw.split(',').map(x => parseInt(x.trim(), 10));
        if (nums.some(n => isNaN(n) || n < 1 || n > 5))
          return await interaction.reply({ content: '❌ Numéros attendus entre 1 et 5, séparés par des virgules (ou `aucune`).', flags: MessageFlags.Ephemeral });

        if (!d.results[sid]) d.results[sid] = [];
        // On retire les résultats précédents de ce match puis on réinjecte
        d.results[sid] = d.results[sid].filter(p => !p.startsWith(`${matchNum}-`));
        for (const n of nums) d.results[sid].push(pickId(matchNum, n - 1));
        saveData(d);

        const detail = nums.length
          ? nums.map(n => `${TIERS[n - 1].emoji} ${m.cotes[n - 1].label} (${m.cotes[n - 1].pts} pts)`).join('\n')
          : '*Aucune cote gagnante sur ce match.*';
        return await interaction.reply({ content: `✅ **${m.title}**\n${detail}`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'classement-ldc') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
          return await interaction.reply({ content: '❌ Réservé aux modérateurs.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sid = interaction.options.getString('session_id');
        const top = interaction.options.getInteger('top') || 20;
        const d = loadData();
        const s = d.sessions[sid];
        if (!s) return await interaction.editReply({ content: `❌ Session \`${sid}\` introuvable.` });

        const rows = [];
        for (const uid of Object.keys(d.picks)) {
          if (!d.picks[uid][sid]) continue;
          const sc = scoreUser(d, s, sid, uid);
          if (sc.picked > 0) rows.push({ uid, ...sc, at: d.picks[uid][sid].validatedAt || Number.MAX_SAFE_INTEGER });
        }
        if (!rows.length) return await interaction.editReply({ content: 'Aucune sélection sur cette session.' });
        rows.sort((a, b) => b.total - a.total || a.at - b.at);

        const medals = ['🥇', '🥈', '🥉'];
        const lines = rows.slice(0, top).map((r, i) =>
          `${medals[i] || `**${i + 1}.**`} <@${r.uid}> · **${r.total} pts** (${r.hits}/${r.picked})`
        );
        const max = rows[0].total;
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${s.name} · Classement`)
          .setDescription(lines.join('\n') + `\n\n━━━━━━━━━━━━━━━\n👥 ${rows.length} participants · 🔝 meilleur score : ${max} pts`)
          .setColor('#f1c40f');
        if (s.image) embed.setThumbnail(s.image);
        await interaction.channel.send({ embeds: [embed] });
        return await interaction.editReply({ content: '✅ Classement posté.' });
      }
      return;
    }

    // ══ BOUTONS ══
    if (!interaction.isButton()) return;
    const parts = interaction.customId.split(':');
    if (parts[0] !== 'ldc') return;
    const action = parts[1];
    const sid = parts[2];

    const d = loadData();
    const s = d.sessions[sid];
    if (!s) return await interaction.reply({ content: '❌ Session introuvable.', flags: MessageFlags.Ephemeral });
    const uid = interaction.user.id;
    const sel = userPicks(d, uid, sid);
    const locked = s.closed || isValidated(d, uid, sid);

    // Ouvrir depuis le panneau public
    if (action === 'open') {
      if (locked) {
        if (!sel.length && s.closed)
          return await interaction.reply({ content: '🔴 Les sélections sont fermées.', flags: MessageFlags.Ephemeral });
        return await interaction.reply({
          embeds: [buildRecapEmbed(d, s, sid, uid)],
          components: buildRecapRows(d, s, sid, uid),
          flags: MessageFlags.Ephemeral,
        });
      }
      return await interaction.reply({
        embeds: [buildMatchEmbed(d, s, sid, uid, 0)],
        components: buildMatchRows(d, s, sid, uid, 0),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (locked) {
      return await interaction.update({
        embeds: [buildRecapEmbed(d, s, sid, uid)],
        components: buildRecapRows(d, s, sid, uid),
      });
    }

    // Naviguer entre les matchs
    if (action === 'nav') {
      const mi = parseInt(parts[3], 10);
      return await interaction.update({
        embeds: [buildMatchEmbed(d, s, sid, uid, mi)],
        components: buildMatchRows(d, s, sid, uid, mi),
      });
    }

    // Sélectionner / retirer une cote
    if (action === 'pick') {
      const mi = parseInt(parts[3], 10);
      const ci = parseInt(parts[4], 10);
      const id = pickId(mi, ci);
      let warning = null;

      if (!d.picks[uid]) d.picks[uid] = {};
      if (!d.picks[uid][sid]) d.picks[uid][sid] = { selection: [], validatedAt: null };
      const cur = d.picks[uid][sid].selection;

      const at = cur.indexOf(id);
      if (at !== -1) {
        cur.splice(at, 1);
      } else if (cur.length >= MAX_PICKS) {
        warning = `Tu as déjà tes ${MAX_PICKS} cotes. Retires-en une pour en ajouter une autre.`;
      } else {
        cur.push(id);
      }
      saveData(d);

      return await interaction.update({
        embeds: [buildMatchEmbed(d, s, sid, uid, mi, warning)],
        components: buildMatchRows(d, s, sid, uid, mi),
      });
    }

    // Récapitulatif
    if (action === 'recap') {
      return await interaction.update({
        embeds: [buildRecapEmbed(d, s, sid, uid)],
        components: buildRecapRows(d, s, sid, uid),
      });
    }

    // Validation définitive
    if (action === 'validate') {
      if (sel.length !== MAX_PICKS) {
        return await interaction.update({
          embeds: [buildRecapEmbed(d, s, sid, uid)],
          components: buildRecapRows(d, s, sid, uid),
        });
      }
      d.picks[uid][sid].validatedAt = Date.now();
      saveData(d);
      const e = buildRecapEmbed(d, s, sid, uid)
        .setTitle('🔒 Sélection validée')
        .setColor('#00C853');
      return await interaction.update({ embeds: [e], components: [] });
    }
    return;

  } catch (e) {
    console.error('[interactionCreate]', e);
    try {
      if (!interaction.replied && !interaction.deferred && interaction.isRepliable?.()) {
        await interaction.reply({ content: '❌ Une erreur est survenue, réessaie.', flags: MessageFlags.Ephemeral });
      }
    } catch (_) { /* le bot reste debout */ }
  }
});

client.once('ready', () => {
  console.log(`⚽ LDC Groupes connecté : ${client.user.tag}`);
  const d = loadData();
  for (const [sid, s] of Object.entries(d.sessions)) {
    if (!s.closed && new Date(s.closeAt) > new Date()) {
      scheduleClose(client, sid);
      console.log(`⏰ Fermeture reprogrammée : ${sid}`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
