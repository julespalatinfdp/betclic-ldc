require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

const create = new SlashCommandBuilder()
  .setName('create-ldc')
  .setDescription('Crée une soirée LDC (admin)')
  .addStringOption(o => o.setName('nom').setDescription('Ex: LDC — Journée 1').setRequired(true))
  .addStringOption(o => o.setName('fermeture').setDescription('Ex: 2026-09-08T18:45:00').setRequired(true))
  .addStringOption(o => o.setName('match1').setDescription('Titre = facile | facile | moyen | moyen | difficile').setRequired(true))
  .addStringOption(o => o.setName('match2').setDescription('Titre = facile | facile | moyen | moyen | difficile').setRequired(true));

for (let i = 3; i <= 8; i++) {
  create.addStringOption(o => o.setName(`match${i}`).setDescription('Titre = facile | facile | moyen | moyen | difficile'));
}
create
  .addStringOption(o => o.setName('image').setDescription("URL du visuel affiché sur le panneau"))
  .addChannelOption(o => o.setName('channel').setDescription('Canal où poster (défaut : ici)'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const commands = [
  create,

  new SlashCommandBuilder()
    .setName('set-result-ldc')
    .setDescription('Enregistre les cotes gagnantes d\'un match (admin)')
    .addStringOption(o => o.setName('session_id').setDescription('ID de la session (ldc_...)').setRequired(true))
    .addIntegerOption(o => o.setName('match').setDescription('Numéro du match (1, 2, 3...)').setRequired(true))
    .addStringOption(o => o.setName('gagnantes').setDescription('Numéros des cotes gagnantes, ex: 1,3,5 (ou "aucune")').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('close-ldc')
    .setDescription('Ferme les sélections manuellement (admin)')
    .addStringOption(o => o.setName('session_id').setDescription('ID de la session (ldc_...)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('classement-ldc')
    .setDescription('Poste le classement de la soirée (modérateurs)')
    .addStringOption(o => o.setName('session_id').setDescription('ID de la session (ldc_...)').setRequired(true))
    .addIntegerOption(o => o.setName('top').setDescription('Nombre de joueurs affichés (défaut : 20)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🔄 Déploiement des commandes LDC...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Commandes déployées !');
  } catch (e) { console.error('❌', e); }
})();
