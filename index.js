const { 
    Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder 
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

const prefix = '!';

// ⚙️ مخازن الإعدادات وقواعد البيانات المؤقتة
const serverSettings = new Map();
const economy = new Map();

const getSettings = (guildId) => {
    if (!serverSettings.has(guildId)) {
        serverSettings.set(guildId, {
            welcomeChannel: null,
            logChannel: null,
            autoRole: null,
            ticketCategory: null,
            botManagerRole: null,
            autoLineEnabled: false, 
            autoLineImage: 'https://media.discordapp.net/attachments/1000000000000000000/1000000000000000000/line.png', 
            ticketDepartments: [
                { label: 'الدعم الفني والتقني', description: 'للمشاكل التقنية العامة', value: 'tech' },
                { label: 'تقديم شكوى أو بلاغ', description: 'للإبلاغ عن مشكلة أو عضو', value: 'report' },
                { label: 'قسم المبيعات', description: 'لشراء الرتب والاستفسارات المالية', value: 'buy' }
            ],
            autoResponses: new Map() 
        });
    }
    return serverSettings.get(guildId);
};

client.once('ready', () => {
    console.log(`🟢 البوت الخارق جاهز ومحصن ضد أخطاء الحذف: ${client.user.tag}`);
});

// ==========================================
// 1. نظام الترحيب والرتب التلقائية
// ==========================================
client.on('guildMemberAdd', async member => {
    const settings = getSettings(member.guild.id);
    if (settings.autoRole) {
        const role = member.guild.roles.cache.get(settings.autoRole);
        if (role) member.roles.add(role).catch(() => {});
    }
    if (settings.welcomeChannel) {
        const welcomeChannel = member.guild.channels.cache.get(settings.welcomeChannel);
        if (welcomeChannel) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎉 عضو جديد انضم إلينا')
                .setDescription(`أهلاً بك ${member} في سيرفر **${member.guild.name}**!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `العضو رقم: ${member.guild.memberCount}` })
                .setTimestamp();
            welcomeChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// ==========================================
// 2. نظام اللوق (Logs)
// ==========================================
client.on('messageDelete', async message => {
    if (message.author?.bot || !message.guild) return;
    const settings = getSettings(message.guild.id);
    if (!settings.logChannel) return;
    const logChannel = message.guild.channels.cache.get(settings.logChannel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🗑️ الرسائل المحذوفة')
        .addFields(
            { name: 'الكاتب:', value: `${message.author}`, inline: true },
            { name: 'القناة:', value: `${message.channel}`, inline: true },
            { name: 'المحتوى:', value: message.content || '_لا يوجد نص (قد تكون صورة)_' }
        ).setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || !oldMessage.guild || oldMessage.content === newMessage.content) return;
    const settings = getSettings(oldMessage.guild.id);
    if (!settings.logChannel) return;
    const logChannel = oldMessage.guild.channels.cache.get(settings.logChannel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('📝 الرسائل المعدلة')
        .addFields(
            { name: 'الكاتب:', value: `${oldMessage.author}`, inline: true },
            { name: 'القناة:', value: `${oldMessage.channel}`, inline: true },
            { name: 'قبل:', value: oldMessage.content || '_فارغ_' },
            { name: 'بعد:', value: newMessage.content || '_فارغ_' }
        ).setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// ==========================================
// 3. نظام التذاكر التفاعلي
// ==========================================
client.on('interactionCreate', async interaction => {
    const settings = getSettings(interaction.guildId);

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
        await interaction.deferReply({ ephemeral: true });

        const selectedValue = interaction.values[0];
        const dept = settings.ticketDepartments.find(d => d.value === selectedValue);
        const deptLabel = dept ? dept.label : 'دعم';

        const channelName = `${selectedValue}-${interaction.user.username}`;
        const existingChannel = interaction.guild.channels.cache.find(ch => ch.name.toLowerCase() === channelName.toLowerCase());
        if (existingChannel) return interaction.editReply({ content: '❌ لديك تذكرة مفتوحة بالفعل في هذا القسم!' });

        const permissionOverwrites = [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
        ];

        if (settings.botManagerRole) {
            permissionOverwrites.push({
                id: settings.botManagerRole,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels]
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: settings.ticketCategory || null,
            permissionOverwrites: permissionOverwrites
        });

        const closeButton = new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 إغلاق التذكرة').setStyle(ButtonStyle.Danger);
        const claimButton = new ButtonBuilder().setCustomId('claim_ticket').setLabel('🙋‍♂️ استلام التذكرة').setStyle(ButtonStyle.Success);
        const ticketButtonsRow = new ActionRowBuilder().addComponents(closeButton, claimButton);

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎫 تذكرة جديدة | قسم ${deptLabel}`)
            .setDescription(`مرحباً بك ${interaction.user} في تذكرتك.\n\n📌 **الرجاء كتابة مشكلتك بالتفصيل وإرفاق الصور أو الملفات التوضيحية لتسهيل الدعم.**`)
            .addFields(
                { name: '👤 العضو:', value: `${interaction.user}`, inline: true },
                { name: '🗂️ القسم:', value: `**${deptLabel}**`, inline: true }
            )
            .setTimestamp();

        await ticketChannel.send({ content: `||${interaction.user}||`, embeds: [welcomeEmbed], components: [ticketButtonsRow.toJSON()] });

        if (settings.logChannel) {
            const logChan = interaction.guild.channels.cache.get(settings.logChannel);
            if (logChan) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('📥 تذكرة مفتوحة جديدة')
                    .setDescription(`تم فتح تذكرة جديدة بواسطة ${interaction.user} في روم ${ticketChannel} (قسم: ${deptLabel})`);
                logChan.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}` });
    }

    if (interaction.isButton()) {
        const hasPermission = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || 
                              (settings.botManagerRole && interaction.member.roles.cache.has(settings.botManagerRole));

        if (interaction.customId === 'claim_ticket') {
            if (!hasPermission) return interaction.reply({ content: '❌ هذا الزر مخصص لطاقم الدعم والإشراف فقط.', ephemeral: true });
            await interaction.reply({ content: `👋 تم استلام التذكرة ومتابعتها بواسطة: ${interaction.user}` });
        }
        if (interaction.customId === 'close_ticket') {
            if (!hasPermission) return interaction.reply({ content: '❌ لا تملك صلاحية لإغلاق التذاكر.', ephemeral: true });
            await interaction.reply({ content: '🔒 جاري حذف التذكرة وسجلها خلال 5 ثوانٍ...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }
    }
});

// ==========================================
// 4. معالجة الرسائل وكافة الأنظمة والأوامر
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const settings = getSettings(message.guild.id);

    // نظام حماية الروابط التلقائية مع حماية من الأخطاء .catch(() => {})
    if (message.content.includes('discord.gg/') || message.content.includes('http')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ ${message.author}، الروابط ممنوعة في هذا السيرفر!`)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
        }
    }

    if (settings.autoResponses && settings.autoResponses.has(message.content)) {
        return message.reply({ content: settings.autoResponses.get(message.content) });
    }

    if (settings.autoLineEnabled && !message.content.startsWith(prefix)) {
        message.channel.send({ files: [settings.autoLineImage] }).catch(() => {});
    }

    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const getUserBalance = (id) => economy.get(id) || 0;
    const setUserBalance = (id, amount) => economy.set(id, amount);

    const isManager = message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                      (settings.botManagerRole && message.member.roles.cache.has(settings.botManagerRole));

    if (command === 'help' || command === 'مساعدة') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#00ffcc')
            .setTitle('🤖 الدليل الكامل لكافة الأوامر المحدثة والأنظمة الذكية')
            .setDescription(`مرحباً بك ${message.author}، الرمز المعتمد: (\`${prefix}\`)`)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '📢 1. أوامر التفاعل والنشر', value: `• \`${prefix}اعلان [النص]\` • \`${prefix}قول [النص]\` • \`${prefix}ايمبد [العنوان] | [الوصف]\`` },
                { name: '⚙️ 2. نظام الخط التلقائي', value: `• \`${prefix}تفعيـل-الخط\` • \`${prefix}تعطيل-الخط\` • \`${prefix}خط [الرابط]\`` },
                { name: '💬 3. الردود التلقائية', value: `• \`${prefix}رد-إضافة [الكلمة] \| [الرد]\` • \`${prefix}رد-مسح [الكلمة]\`` },
                { name: '🎫 4. التحكم بالتذاكر', value: `• \`${prefix}رتبة-البوت [@الرتبة]\` • \`${prefix}قسم\` • \`${prefix}تصفير\` • \`${prefix}تكت\` • \`${prefix}فئة\`` },
                { name: '🛡️ 5. الإشراف والاقتصاد', value: `• \`${prefix}قفل\` • \`${prefix}فتح\` • \`${prefix}مسح [العدد]\` • \`${prefix}فلوس\` • \`${prefix}راتب\`` }
            )
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    if (command === 'اعلان' || command === 'announcement') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية للاعلان.');
        const announceText = args.join(' ');
        if (!announceText) return message.reply('📌 الرجاء كتابة محتوى الإعلان بعد الأمر.');

        await message.delete().catch(() => {});
        const announceEmbed = new EmbedBuilder()
            .setColor('#FF0055')
            .setTitle('📢 إعلان رسمي وهام')
            .setDescription(announceText)
            .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() })
            .setTimestamp();

        return message.channel.send({ content: '@everyone', embeds: [announceEmbed] });
    }

    if (command === 'قول' || command === 'say') {
        if (!isManager) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const textToSay = args.join(' ');
        if (!textToSay) return message.reply('📌 اكتب الكلام الذي تريدني أن أقوله.');
        
        await message.delete().catch(() => {});
        return message.channel.send({ content: textToSay });
    }

    if (command === 'تفعيل-الخط') {
        if (!isManager) return message.reply('❌ للإدارة فقط.');
        settings.autoLineEnabled = true;
        return message.reply('✅ تم تفعيل نظام الخط التلقائي بنجاح في جميع الرومات.');
    }

    if (command === 'تعطيل-الخط') {
        if (!isManager) return message.reply('❌ للإدارة فقط.');
        settings.autoLineEnabled = false;
        return message.reply('❌ تم إيقاف نظام الخط التلقائي.');
    }

    if (command === 'خط') {
        if (!isManager) return message.reply('❌ للإدارة فقط.');
        const lineLink = args[0] || (message.attachments.first() ? message.attachments.first().url : null);
        if (!lineLink) return message.reply('📌 يرجى إرفاق رابط صورة الخط أو رفعها مع الأمر.');
        
        settings.autoLineImage = lineLink;
        return message.reply({ content: '✅ تم تحديث شكل الخط بنجاح، إليك المعاينة:', files: [lineLink] });
    }

    if (command === 'رد-إضافة') {
        if (!isManager) return message.reply('❌ للإدارة فقط.');
        const rawArgs = args.join(' ');
        const parts = rawArgs.split('|').map(p => p.trim());
        if (parts.length < 2) return message.reply('📌 طريقة إضافة الرد التلقائي:\n`!رد-إضافة الكلمة | الرد`');

        settings.autoResponses.set(parts[0], parts[1]);
        return message.reply(`✅ تم حفظ الرد بنجاح للكلمة: **"${parts[0]}"**`);
    }

    if (command === 'رد-مسح') {
        if (!isManager) return message.reply('❌ للإدارة فقط.');
        const triggerWord = args.join(' ');
        if (!triggerWord) return message.reply('📌 اكتب الكلمة المراد مسحها.');

        if (settings.autoResponses.has(triggerWord)) {
            settings.autoResponses.delete(triggerWord);
            return message.reply(`✅ تم حذف الرد بنجاح.`);
        } else {
            return message.reply('❌ لم أجد رد مسجل لهذه الكلمة.');
        }
    }

    if (command === 'رتبة-البوت') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ للأدمن فقط.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('📌 منشن الرتبة.');
        
        settings.botManagerRole = role.id;
        return message.reply(`✅ تم تعيين رتبة **${role.name}** لإدارة البوت.`);
    }

    if (command === 'ايمبد') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        const rawArgs = args.join(' ');
        const parts = rawArgs.split('|').map(p => p.trim());
        if (parts.length < 2) return message.reply('📌 طريقة كتابة الأمر:\n`!ايمبد العنوان | الوصف`');

        const embedColor = parts[2] || '#5865F2';
        const customEmbed = new EmbedBuilder()
            .setTitle(parts[0])
            .setDescription(parts[1])
            .setColor(embedColor.startsWith('#') ? embedColor : '#5865F2')
            .setTimestamp();

        return message.channel.send({ embeds: [customEmbed] }).then(() => message.delete().catch(() => {}));
    }

    if (command === 'قسم') {
        if (!isManager) return message.reply('❌ لا تملك صلاحية.');
        const rawArgs = args.join(' ');
        const parts = rawArgs.split('|').map(p => p.trim());
        if (parts.length < 3) return message.reply('📌 الاستخدام: `!قسم الاسم | الوصف | اسم_الروم`');
        if (settings.ticketDepartments.length === 3 && settings.ticketDepartments[0].value === 'tech') {
            settings.ticketDepartments = [];
        }
        settings.ticketDepartments.push({
            label: parts[0],
            description: parts[1],
            value: parts[2].toLowerCase().replace(/[^a-z0-9]/g, '-')
        });
        return message.reply(`✅ تم إضافة قسم **${parts[0]}**.`);
    }

    if (command === 'تصفير') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        settings.ticketDepartments = [
            { label: 'الدعم الفني والتقني', description: 'للمشاكل التقنية العامة', value: 'tech' },
            { label: 'تقديم شكوى أو بلاغ', description: 'للإبلاغ عن مشكلة أو عضو', value: 'report' },
            { label: 'قسم المبيعات', description: 'لشراء الرتب والاستفسارات المالية', value: 'buy' }
        ];
        return message.reply('✅ تم إعادة تعيين الأقسام الافتراضية.');
    }

    if (command === 'تكت') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        if (settings.ticketDepartments.length === 0) return message.reply('❌ لا توجد أقسام.');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_ticket_type')
            .setPlaceholder('📁 اضغط هنا واختير القسم المناسب لمشكلتك')
            .addOptions(settings.ticketDepartments);

        const menuRow = new ActionRowBuilder().addComponents(menu);
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎫 مركز فتح التذاكر المطور والدعم الفني')
            .setDescription('الرجاء اختيار القسم المطلوب من القائمة في الأسفل.')
            .setFooter({ text: message.guild.name })
            .setTimestamp();

        return message.channel.send({ embeds: [embed], components: [menuRow.toJSON()] });
    }

    if (command === 'فئة') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        const categoryId = args[0];
        if (!categoryId) return message.reply('📌 ضع آيدي الفئة.');
        settings.ticketCategory = categoryId;
        return message.reply('✅ تم ربط نظام التذاكر بالفئة.');
    }

    if (command === 'ترحيب') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('📌 منشن القناة.');
        settings.welcomeChannel = channel.id;
        return message.reply(`✅ تم تعيين قناة الترحيب.`);
    }

    if (command === 'لوق') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('📌 منشن القناة.');
        settings.logChannel = channel.id;
        return message.reply(`✅ تم تعيين قناة اللوق.`);
    }

    if (command === 'رتبة') {
        if (!isManager) return message.reply('❌ لا تملك الصلاحية.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('📌 منشن الرتبة.');
        settings.autoRole = role.id;
        return message.reply(`✅ تم تعيين الرتبة التلقائية.`);
    }

    if (command === 'فلوس' || command === 'coins') {
        const balance = getUserBalance(message.author.id);
        return message.reply(`🪙 رصيدك الحالي هو: **${balance}** عملة.`);
    }

    if (command === 'راتب' || command === 'daily') {
        const currentBalance = getUserBalance(message.author.id);
        setUserBalance(message.author.id, currentBalance + 150);
        return message.reply(`💰 تم صرف راتبك اليومي (150 عملة).`);
    }

    if (command === 'تحويل') {
        const member = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if (!member || !amount || amount <= 0) return message.reply('📌 الاستخدام: `!تحويل [@العضو] [المبلغ]`');
        const senderBalance = getUserBalance(message.author.id);
        if (senderBalance < amount) return message.reply('❌ رصيدك لا يكفي.');
        setUserBalance(message.author.id, senderBalance - amount);
        setUserBalance(member.id, getUserBalance(member.id) + amount);
        return message.reply(`✅ تم تحويل **${amount}** عملة إلى ${member}.`);
    }

    if (command === 'قفل') {
        if (!isManager) return message.reply('❌ لا تملك صلاحية.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.channel.send('🔒 تم قفل القناة الحالية.');
    }

    if (command === 'فتح') {
        if (!isManager) return message.reply('❌ لا تملك صلاحية.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return message.channel.send('🔓 تم فتح القناة الحالية.');
    }

    if (command === 'مسح') {
        if (!isManager) return message.reply('❌ لا تملك صلاحية.');
        const amount = parseInt(args[0]) || 50;
        // الفلترة لضمان عدم حدوث كراش مع الرسائل القديمة أو المحذوفة
        await message.channel.bulkDelete(amount, true).catch(() => {});
        return message.channel.send(`🧹 تم مسح الرسائل بنجاح.`)
            .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
    }
});

// يرجى وضع التوكن الجديد والمحمي هنا (تأكد من عمل Reset للتوكن من موقع ديسكورد أولاً لسلامة سيرفرك)
client.login('MTUxNjk3NjM2NjkwNDY3MjI2Ng.GwzPt6.DfV6fUEzM3wA24gE_TIotm96aAJD61fwvQoOXI');
