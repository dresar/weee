const GroupManager = require('../utils/groupManager');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

class GroupAnalyticsCommands {
    constructor() {
        this.groupManager = new GroupManager();
    }

    // Track message activity
    async trackMessage(groupId, userId, messageType = 'text') {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const today = moment().format('YYYY-MM-DD');
                const thisWeek = moment().format('YYYY-[W]WW');
                const thisMonth = moment().format('YYYY-MM');
                
                // Initialize analytics if not exists or has old structure
                if (!group.analytics || !group.analytics.messages) {
                    group.analytics = this.initializeAnalytics();
                }
                
                const analytics = group.analytics;
                
                // Update message counts
                analytics.messages.total++;
                analytics.messages.daily[today] = (analytics.messages.daily[today] || 0) + 1;
                analytics.messages.weekly[thisWeek] = (analytics.messages.weekly[thisWeek] || 0) + 1;
                analytics.messages.monthly[thisMonth] = (analytics.messages.monthly[thisMonth] || 0) + 1;
                
                // Update message types
                if (analytics.messageTypes[messageType] !== undefined) {
                    analytics.messageTypes[messageType]++;
                }
                
                // Update peak hours
                const currentHour = moment().hour();
                analytics.peakHours[currentHour] = (analytics.peakHours[currentHour] || 0) + 1;
                
                // Update active users
                if (!analytics.activeUsers.daily[today]) {
                    analytics.activeUsers.daily[today] = new Set();
                }
                if (!analytics.activeUsers.weekly[thisWeek]) {
                    analytics.activeUsers.weekly[thisWeek] = new Set();
                }
                if (!analytics.activeUsers.monthly[thisMonth]) {
                    analytics.activeUsers.monthly[thisMonth] = new Set();
                }
                
                analytics.activeUsers.daily[today].add(userId);
                analytics.activeUsers.weekly[thisWeek].add(userId);
                analytics.activeUsers.monthly[thisMonth].add(userId);
                
                // Convert Sets to Arrays for JSON storage
                analytics.activeUsers.daily[today] = Array.from(analytics.activeUsers.daily[today]);
                analytics.activeUsers.weekly[thisWeek] = Array.from(analytics.activeUsers.weekly[thisWeek]);
                analytics.activeUsers.monthly[thisMonth] = Array.from(analytics.activeUsers.monthly[thisMonth]);
                
                // Update user stats
                if (!analytics.userStats[userId]) {
                    analytics.userStats[userId] = {
                        totalMessages: 0,
                        messageTypes: { text: 0, image: 0, video: 0, audio: 0, document: 0, sticker: 0 },
                        commandsUsed: 0,
                        firstSeen: moment().toISOString(),
                        lastSeen: moment().toISOString(),
                        dailyActivity: {}
                    };
                }
                
                const userStats = analytics.userStats[userId];
                userStats.totalMessages++;
                userStats.lastSeen = moment().toISOString();
                userStats.dailyActivity[today] = (userStats.dailyActivity[today] || 0) + 1;
                
                if (userStats.messageTypes[messageType] !== undefined) {
                    userStats.messageTypes[messageType]++;
                }
                
                await this.groupManager.updateGroup(groupId, group);
            }
        } catch (error) {
            console.error('Error tracking message:', error);
        }
    }

    // Track command usage
    async trackCommand(groupId, userId, commandName) {
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                const today = moment().format('YYYY-MM-DD');
                const thisWeek = moment().format('YYYY-[W]WW');
                const thisMonth = moment().format('YYYY-MM');
                
                // Initialize analytics if not exists or has old structure
                if (!group.analytics || !group.analytics.commands) {
                    group.analytics = this.initializeAnalytics();
                }
                
                const analytics = group.analytics;
                
                // Update command counts
                analytics.commands.total++;
                analytics.commands.daily[today] = (analytics.commands.daily[today] || 0) + 1;
                analytics.commands.weekly[thisWeek] = (analytics.commands.weekly[thisWeek] || 0) + 1;
                analytics.commands.monthly[thisMonth] = (analytics.commands.monthly[thisMonth] || 0) + 1;
                
                // Update user command stats
                if (analytics.userStats[userId]) {
                    analytics.userStats[userId].commandsUsed++;
                }
                
                await this.groupManager.updateGroup(groupId, group);
            }
        } catch (error) {
            console.error('Error tracking command:', error);
        }
    }

    // Show group statistics
    async handleStats(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.analytics) {
                return await sock.sendMessage(groupId, {
                    text: '📊 *STATISTIK GRUP*\n\nBelum ada data statistik.\nData akan mulai dikumpulkan setelah ada aktivitas di grup.'
                });
            }
            
            const analytics = group.analytics;
            const period = args[0] || 'today';
            
            let statsText = '';
            
            switch (period.toLowerCase()) {
                case 'today':
                    statsText = await this.generateTodayStats(analytics);
                    break;
                case 'week':
                    statsText = await this.generateWeekStats(analytics);
                    break;
                case 'month':
                    statsText = await this.generateMonthStats(analytics);
                    break;
                case 'all':
                    statsText = await this.generateAllTimeStats(analytics);
                    break;
                default:
                    return await sock.sendMessage(groupId, {
                        text: '❌ Format: `.stats [today/week/month/all]`\n\nContoh: `.stats today`'
                    });
            }
            
            await sock.sendMessage(groupId, {
                text: statsText
            });
            
        } catch (error) {
            console.error('Error showing stats:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan statistik.'
            });
        }
    }

    // Generate today's stats
    async generateTodayStats(analytics) {
        const today = moment().format('YYYY-MM-DD');
        const todayMessages = analytics.messages.daily[today] || 0;
        const todayCommands = analytics.commands.daily[today] || 0;
        const activeUsersToday = analytics.activeUsers.daily[today] || [];
        
        let statsText = `📊 *STATISTIK HARI INI*\n`;
        statsText += `📅 *${moment().format('DD MMMM YYYY')}*\n\n`;
        statsText += `💬 *Pesan:* ${todayMessages}\n`;
        statsText += `⚡ *Perintah:* ${todayCommands}\n`;
        statsText += `👥 *Pengguna Aktif:* ${activeUsersToday.length}\n\n`;
        
        // Peak hour today
        const currentHour = moment().hour();
        const peakHour = this.findPeakHour(analytics.peakHours);
        statsText += `⏰ *Jam Tersibuk:* ${peakHour.hour}:00 (${peakHour.count} pesan)\n`;
        statsText += `🕐 *Jam Sekarang:* ${currentHour}:00\n\n`;
        
        // Message types today (estimated)
        const messageTypes = analytics.messageTypes;
        const totalMessages = analytics.messages.total;
        if (totalMessages > 0) {
            statsText += `📝 *Tipe Pesan Hari Ini:*\n`;
            Object.entries(messageTypes).forEach(([type, count]) => {
                const percentage = ((count / totalMessages) * 100).toFixed(1);
                const todayEstimate = Math.round((count / totalMessages) * todayMessages);
                statsText += `   ${this.getMessageTypeIcon(type)} ${type}: ${todayEstimate} (${percentage}%)\n`;
            });
        }
        
        return statsText;
    }

    // Generate week stats
    async generateWeekStats(analytics) {
        const thisWeek = moment().format('YYYY-[W]WW');
        const weekMessages = analytics.messages.weekly[thisWeek] || 0;
        const weekCommands = analytics.commands.weekly[thisWeek] || 0;
        const activeUsersWeek = analytics.activeUsers.weekly[thisWeek] || [];
        
        let statsText = `📊 *STATISTIK MINGGU INI*\n`;
        statsText += `📅 *Minggu ${moment().format('WW, YYYY')}*\n\n`;
        statsText += `💬 *Pesan:* ${weekMessages}\n`;
        statsText += `⚡ *Perintah:* ${weekCommands}\n`;
        statsText += `👥 *Pengguna Aktif:* ${activeUsersWeek.length}\n\n`;
        
        // Daily breakdown this week
        statsText += `📈 *Aktivitas Harian:*\n`;
        for (let i = 0; i < 7; i++) {
            const date = moment().startOf('week').add(i, 'days');
            const dateStr = date.format('YYYY-MM-DD');
            const dayMessages = analytics.messages.daily[dateStr] || 0;
            const dayName = date.format('dddd');
            statsText += `   ${dayName}: ${dayMessages} pesan\n`;
        }
        
        return statsText;
    }

    // Generate month stats
    async generateMonthStats(analytics) {
        const thisMonth = moment().format('YYYY-MM');
        const monthMessages = analytics.messages.monthly[thisMonth] || 0;
        const monthCommands = analytics.commands.monthly[thisMonth] || 0;
        const activeUsersMonth = analytics.activeUsers.monthly[thisMonth] || [];
        
        let statsText = `📊 *STATISTIK BULAN INI*\n`;
        statsText += `📅 *${moment().format('MMMM YYYY')}*\n\n`;
        statsText += `💬 *Pesan:* ${monthMessages}\n`;
        statsText += `⚡ *Perintah:* ${monthCommands}\n`;
        statsText += `👥 *Pengguna Aktif:* ${activeUsersMonth.length}\n\n`;
        
        // Weekly breakdown this month
        statsText += `📈 *Aktivitas Mingguan:*\n`;
        const weeksInMonth = Math.ceil(moment().daysInMonth() / 7);
        for (let i = 0; i < weeksInMonth; i++) {
            const weekStart = moment().startOf('month').add(i * 7, 'days');
            const weekStr = weekStart.format('YYYY-[W]WW');
            const weekMessages = analytics.messages.weekly[weekStr] || 0;
            statsText += `   Minggu ${i + 1}: ${weekMessages} pesan\n`;
        }
        
        return statsText;
    }

    // Generate all-time stats
    async generateAllTimeStats(analytics) {
        const totalMessages = analytics.messages.total;
        const totalCommands = analytics.commands.total;
        const totalUsers = Object.keys(analytics.userStats).length;
        
        let statsText = `📊 *STATISTIK KESELURUHAN*\n\n`;
        statsText += `💬 *Total Pesan:* ${totalMessages.toLocaleString()}\n`;
        statsText += `⚡ *Total Perintah:* ${totalCommands.toLocaleString()}\n`;
        statsText += `👥 *Total Pengguna:* ${totalUsers}\n\n`;
        
        // Message types
        statsText += `📝 *Tipe Pesan:*\n`;
        Object.entries(analytics.messageTypes).forEach(([type, count]) => {
            const percentage = totalMessages > 0 ? ((count / totalMessages) * 100).toFixed(1) : '0.0';
            statsText += `   ${this.getMessageTypeIcon(type)} ${type}: ${count.toLocaleString()} (${percentage}%)\n`;
        });
        
        // Peak hour
        const peakHour = this.findPeakHour(analytics.peakHours);
        statsText += `\n⏰ *Jam Tersibuk:* ${peakHour.hour}:00 (${peakHour.count} pesan)\n`;
        
        // Top users
        const topUsers = Object.entries(analytics.userStats)
            .sort(([,a], [,b]) => b.totalMessages - a.totalMessages)
            .slice(0, 5);
        
        if (topUsers.length > 0) {
            statsText += `\n🏆 *Top 5 Pengguna Aktif:*\n`;
            topUsers.forEach(([userId, stats], index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                statsText += `   ${medal} @${userId.split('@')[0]}: ${stats.totalMessages} pesan\n`;
            });
        }
        
        return statsText;
    }

    // Initialize analytics structure
    initializeAnalytics() {
        return {
            messages: { total: 0, daily: {}, weekly: {}, monthly: {} },
            commands: { total: 0, daily: {}, weekly: {}, monthly: {} },
            activeUsers: { daily: {}, weekly: {}, monthly: {} },
            messageTypes: { text: 0, image: 0, video: 0, audio: 0, document: 0, sticker: 0 },
            peakHours: {},
            userStats: {}
        };
    }

    // Show user statistics
    async handleUserStats(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.analytics || !group.analytics.userStats) {
                return await sock.sendMessage(groupId, {
                    text: '📊 *STATISTIK PENGGUNA*\n\nBelum ada data statistik pengguna.'
                });
            }
            
            // Get target user (mention or sender)
            let targetUserId = senderId;
            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetUserId = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }
            
            const userStats = group.analytics.userStats[targetUserId];
            if (!userStats) {
                return await sock.sendMessage(groupId, {
                    text: `📊 *STATISTIK PENGGUNA*\n\n❌ Tidak ada data untuk @${targetUserId.split('@')[0]}`,
                    mentions: [targetUserId]
                });
            }
            
            const username = targetUserId.split('@')[0];
            const memberSince = moment(userStats.firstSeen).format('DD MMMM YYYY');
            const lastActive = moment(userStats.lastSeen).fromNow();
            
            let userStatsText = `📊 *STATISTIK PENGGUNA*\n\n`;
            userStatsText += `👤 *Pengguna:* @${username}\n`;
            userStatsText += `📅 *Bergabung:* ${memberSince}\n`;
            userStatsText += `🕐 *Terakhir Aktif:* ${lastActive}\n\n`;
            userStatsText += `💬 *Total Pesan:* ${userStats.totalMessages.toLocaleString()}\n`;
            userStatsText += `⚡ *Perintah Digunakan:* ${userStats.commandsUsed}\n\n`;
            
            // Message types
            userStatsText += `📝 *Tipe Pesan:*\n`;
            Object.entries(userStats.messageTypes).forEach(([type, count]) => {
                if (count > 0) {
                    const percentage = ((count / userStats.totalMessages) * 100).toFixed(1);
                    userStatsText += `   ${this.getMessageTypeIcon(type)} ${type}: ${count} (${percentage}%)\n`;
                }
            });
            
            // Recent activity (last 7 days)
            userStatsText += `\n📈 *Aktivitas 7 Hari Terakhir:*\n`;
            for (let i = 6; i >= 0; i--) {
                const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
                const dayMessages = userStats.dailyActivity[date] || 0;
                const dayName = moment().subtract(i, 'days').format('ddd');
                userStatsText += `   ${dayName}: ${dayMessages} pesan\n`;
            }
            
            await sock.sendMessage(groupId, {
                text: userStatsText,
                mentions: [targetUserId]
            });
            
        } catch (error) {
            console.error('Error showing user stats:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan statistik pengguna.'
            });
        }
    }

    // Show leaderboard
    async handleLeaderboard(sock, msg, args) {
        const groupId = msg.key.remoteJid;
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.analytics || !group.analytics.userStats) {
                return await sock.sendMessage(groupId, {
                    text: '🏆 *LEADERBOARD*\n\nBelum ada data untuk leaderboard.'
                });
            }
            
            const type = args[0] || 'messages';
            let leaderboardText = '';
            let sortedUsers = [];
            
            switch (type.toLowerCase()) {
                case 'messages':
                    sortedUsers = Object.entries(group.analytics.userStats)
                        .sort(([,a], [,b]) => b.totalMessages - a.totalMessages)
                        .slice(0, 10);
                    
                    leaderboardText = `🏆 *LEADERBOARD PESAN*\n\n`;
                    sortedUsers.forEach(([userId, stats], index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                        leaderboardText += `${medal} @${userId.split('@')[0]}\n`;
                        leaderboardText += `   💬 ${stats.totalMessages.toLocaleString()} pesan\n\n`;
                    });
                    break;
                    
                case 'commands':
                    sortedUsers = Object.entries(group.analytics.userStats)
                        .sort(([,a], [,b]) => b.commandsUsed - a.commandsUsed)
                        .slice(0, 10);
                    
                    leaderboardText = `🏆 *LEADERBOARD PERINTAH*\n\n`;
                    sortedUsers.forEach(([userId, stats], index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                        leaderboardText += `${medal} @${userId.split('@')[0]}\n`;
                        leaderboardText += `   ⚡ ${stats.commandsUsed} perintah\n\n`;
                    });
                    break;
                    
                default:
                    return await sock.sendMessage(groupId, {
                        text: '❌ Format: `.leaderboard [messages/commands]`\n\nContoh: `.leaderboard messages`'
                    });
            }
            
            if (sortedUsers.length === 0) {
                leaderboardText += 'Belum ada data untuk ditampilkan.';
            }
            
            const mentions = sortedUsers.map(([userId]) => userId);
            
            await sock.sendMessage(groupId, {
                text: leaderboardText,
                mentions: mentions
            });
            
        } catch (error) {
            console.error('Error showing leaderboard:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat menampilkan leaderboard.'
            });
        }
    }

    // Export analytics data
    async handleExportStats(sock, msg) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mengekspor data statistik.'
            });
        }
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (!group || !group.analytics) {
                return await sock.sendMessage(groupId, {
                    text: '❌ Tidak ada data statistik untuk diekspor.'
                });
            }
            
            // Create export data
            const exportData = {
                groupId: groupId,
                groupName: group.name || 'Unknown Group',
                exportDate: moment().toISOString(),
                analytics: group.analytics,
                summary: {
                    totalMessages: group.analytics.messages.total,
                    totalCommands: group.analytics.commands.total,
                    totalUsers: Object.keys(group.analytics.userStats).length,
                    dataRange: {
                        firstMessage: this.getFirstMessageDate(group.analytics),
                        lastMessage: this.getLastMessageDate(group.analytics)
                    }
                }
            };
            
            // Save to file
            const filename = `group_analytics_${groupId.replace('@g.us', '')}_${moment().format('YYYY-MM-DD')}.json`;
            const filepath = path.join(__dirname, '..', 'exports', filename);
            
            // Create exports directory if not exists
            const exportsDir = path.dirname(filepath);
            if (!fs.existsSync(exportsDir)) {
                fs.mkdirSync(exportsDir, { recursive: true });
            }
            
            fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
            
            await sock.sendMessage(groupId, {
                text: `✅ *Data statistik berhasil diekspor*\n\n` +
                      `📁 *File:* ${filename}\n` +
                      `📊 *Total Pesan:* ${exportData.summary.totalMessages.toLocaleString()}\n` +
                      `⚡ *Total Perintah:* ${exportData.summary.totalCommands.toLocaleString()}\n` +
                      `👥 *Total Pengguna:* ${exportData.summary.totalUsers}\n\n` +
                      `👤 *Diekspor oleh:* @${senderId.split('@')[0]}`,
                mentions: [senderId]
            });
            
        } catch (error) {
            console.error('Error exporting stats:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mengekspor data statistik.'
            });
        }
    }

    // Helper functions
    findPeakHour(peakHours) {
        let maxHour = 0;
        let maxCount = 0;
        
        Object.entries(peakHours).forEach(([hour, count]) => {
            if (count > maxCount) {
                maxCount = count;
                maxHour = parseInt(hour);
            }
        });
        
        return { hour: maxHour, count: maxCount };
    }

    getMessageTypeIcon(type) {
        const icons = {
            text: '💬',
            image: '🖼️',
            video: '🎥',
            audio: '🎵',
            document: '📄',
            sticker: '🎭'
        };
        return icons[type] || '📝';
    }

    getFirstMessageDate(analytics) {
        const dailyDates = Object.keys(analytics.messages.daily);
        if (dailyDates.length === 0) return null;
        return dailyDates.sort()[0];
    }

    getLastMessageDate(analytics) {
        const dailyDates = Object.keys(analytics.messages.daily);
        if (dailyDates.length === 0) return null;
        return dailyDates.sort().reverse()[0];
    }

    // Clean old analytics data (keep last 90 days)
    async cleanOldAnalytics() {
        try {
            const groups = this.groupManager.getAllGroups();
            const cutoffDate = moment().subtract(90, 'days').format('YYYY-MM-DD');
            
            for (const [groupId, group] of Object.entries(groups)) {
                if (group.analytics) {
                    // Clean daily data
                    Object.keys(group.analytics.messages.daily).forEach(date => {
                        if (date < cutoffDate) {
                            delete group.analytics.messages.daily[date];
                            delete group.analytics.commands.daily[date];
                            delete group.analytics.activeUsers.daily[date];
                        }
                    });
                    
                    // Clean user daily activity
                    Object.values(group.analytics.userStats).forEach(userStats => {
                        Object.keys(userStats.dailyActivity).forEach(date => {
                            if (date < cutoffDate) {
                                delete userStats.dailyActivity[date];
                            }
                        });
                    });
                    
                    await this.groupManager.updateGroup(groupId, group);
                }
            }
            
            console.log('Old analytics data cleaned successfully');
        } catch (error) {
            console.error('Error cleaning old analytics:', error);
        }
    }

    // Reset analytics data
    async handleResetStats(sock, msg) {
        const groupId = msg.key.remoteJid;
        const senderId = (msg.key.participant || msg.key.remoteJid).replace('@s.whatsapp.net', '');
        
        if (!this.groupManager.isAdmin(groupId, senderId)) {
            return await sock.sendMessage(groupId, {
                text: '❌ Hanya admin yang dapat mereset data statistik.'
            });
        }
        
        try {
            const group = this.groupManager.getGroup(groupId);
            if (group) {
                // Backup current analytics before reset
                const backupData = {
                    groupId: groupId,
                    resetDate: moment().toISOString(),
                    resetBy: senderId,
                    oldAnalytics: group.analytics
                };
                
                const backupFilename = `analytics_backup_${groupId.replace('@g.us', '')}_${moment().format('YYYY-MM-DD-HH-mm-ss')}.json`;
                const backupPath = path.join(__dirname, '..', 'backups', backupFilename);
                
                // Create backups directory if not exists
                const backupsDir = path.dirname(backupPath);
                if (!fs.existsSync(backupsDir)) {
                    fs.mkdirSync(backupsDir, { recursive: true });
                }
                
                fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
                
                // Reset analytics
                group.analytics = {
                    messages: { total: 0, daily: {}, weekly: {}, monthly: {} },
                    commands: { total: 0, daily: {}, weekly: {}, monthly: {} },
                    activeUsers: { daily: {}, weekly: {}, monthly: {} },
                    messageTypes: { text: 0, image: 0, video: 0, audio: 0, document: 0, sticker: 0 },
                    peakHours: {},
                    userStats: {}
                };
                
                await this.groupManager.updateGroup(groupId, group);
                
                await sock.sendMessage(groupId, {
                    text: `✅ *Data statistik berhasil direset*\n\n` +
                          `💾 *Backup disimpan:* ${backupFilename}\n` +
                          `👤 *Direset oleh:* @${senderId.split('@')[0]}\n\n` +
                          `📊 Data statistik baru akan mulai dikumpulkan dari sekarang.`,
                    mentions: [senderId]
                });
            }
        } catch (error) {
            console.error('Error resetting stats:', error);
            await sock.sendMessage(groupId, {
                text: '❌ Terjadi kesalahan saat mereset data statistik.'
            });
        }
    }
}

module.exports = GroupAnalyticsCommands;