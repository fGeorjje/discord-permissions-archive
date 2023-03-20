const { Client, Events, ChannelType, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const prompts = require('prompts');
const fs = require('fs');

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
  }
})();

async function main() {
  let token;
  if (fs.existsSync('token')) {
    token = fs.readFileSync('token', { encoding: 'utf8' });
    console.log('Read discord token from file.');
  } else {
    token = await promptText('Please provide your discord bot token. NOTE: The bot MUST have the "Server Members" intent set.');
    fs.promises.writeFile('token', token);
  }
  
  let client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });
  
  let resolve, clientLoggedIn = new Promise(r => resolve = r);
  client.once(Events.ClientReady, async (c) => {
    resolve(c);
  });
  
  client.login(token);
  client = await clientLoggedIn;
  console.log(`Logged in as ${client.user.tag}!`);
  
  const allChannelsPromises = Array.from(client.guilds.cache.values())
    .map(guild => {
       return guild.channels.fetch();
    });
  
  Array.prototype.sortByKey = function(key) {
    this.sort((a, b) => {
      const keyA = key(a);
      const keyB = key(b);
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });
    return this;
  };
  
  const choices = (await Promise.all(allChannelsPromises))
    .flatMap(collection => Array.from(collection.values()))
    .filter(c => c.type === ChannelType.GuildCategory)
    .sortByKey(c => c.rawPosition)
    .sortByKey(c => c.guild.name)
    .map(c => {
      return {
        title: `${c.name} (in ${c.guild.name})`,
        value: c
      };
    });

  const categoryPrompt = await prompts({
    type: 'multiselect',
    name: 'categories',
    message: 'Select the category that you wish to archive',
    choices: choices
  });
  const categories = categoryPrompt.categories;
  const channels = categories.flatMap(category => {
    return Array.from(category.children.cache.values());
  });
  
  const channelNames = `${channels.map(c => "'" + c.name + "'").join(', ')}`
  console.log(`Selected channels ${channelNames}`);
  
  const fetchedGulds = {};
  for (const category of categories) {
    if (fetchedGulds[category.guild.id]) continue;
    console.log(`Fetching full guild member list for caching (this may take a while...)`);
    const members = await category.guild.members.fetch();
    console.log(`Fetched ${members.size} members`);
    fetchedGulds[category.guild.id] = true;
  }
  
  const confirm = await promptText(
    'You are about to archive the above channels.\n' + 
    'This is a destructive operation and undoing this would take a while.\n' +
    'If you are sure to proceed, type the following: I AM SURE'
  );
  
  if (confirm !== 'I AM SURE') {
    console.log('Aborting');
    client.destroy();
    return;
  }
  
  const start = Date.now();
  console.log(`Starting archive at time ${start}`);
  const promises = Array.from(channels).map(channel => {
    return archiveChannel(channel);
  });
  await Promise.all(promises);
  const end = Date.now();
  console.log(`Finished archive at time ${end}`);
  console.log(`Archive took ${end - start}ms`);
  client.destroy();
}

async function promptText(message) {
  return (await prompts({ type: 'text', name: 'value', message })).value;
}

async function archiveChannel(channel) {
  const members = Array.from(channel.members.values());
  const data = members.map((member) => {
    return {
      id: member.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel],
      deny: [PermissionsBitField.Flags.SendMessages]
    }
  });
  
  data.push({
    id: channel.guild.roles.everyone.id,
    deny: [PermissionsBitField.Flags.ViewChannel]
  });
  
  console.log(`Archiving ${channel.name}`);
  await channel.permissionOverwrites.set(data);
  console.log(`Finished archiving ${channel.name}`);
}