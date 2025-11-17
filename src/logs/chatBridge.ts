import { BrowserWindow } from 'electron';
import { MinecraftChatLogger } from './chat-logger';

export function initChatBridge(getWindow: () => BrowserWindow | null) {
  try {
    const chat = new MinecraftChatLogger();

    const withWin = (cb: (win: BrowserWindow) => void) => {
      const w = getWindow();
      if (!w) return;
      cb(w);
    };

    chat.on('playersUpdated', (players: string[]) => {
      withWin((win) => win.webContents.send('chat:players', players));
    });

    chat.on('partyUpdated', (members: string[]) => {
      withWin((win) => win.webContents.send('chat:party', members));
    });

    chat.on('partyInvite', (inviter: string) => {
      withWin((win) => win.webContents.send('chat:partyInvite', inviter));
    });

    chat.on('partyInviteExpired', (player: string) => {
      withWin((win) => win.webContents.send('chat:partyInviteExpired', player));
    });

    chat.on('partyCleared', () => {
      withWin((win) => win.webContents.send('chat:partyCleared'));
    });

    chat.on('finalKill', (name: string) => {
      withWin((win) => win.webContents.send('chat:finalKill', name));
    });

    chat.on('message', (payload: { name: string; text: string }) => {
      withWin((win) => win.webContents.send('chat:message', payload));
    });

    chat.on('serverChange', () => {
      withWin((win) => win.webContents.send('chat:serverChange'));
    });

    chat.on('lobbyJoined', () => {
      withWin((win) => win.webContents.send('chat:lobbyJoined'));
    });

    chat.on('gameStart', () => {
      withWin((win) => win.webContents.send('chat:gameStart'));
    });

    chat.on('guildMembersUpdated', (players: string[]) => {
      withWin((win) => win.webContents.send('chat:guildMembers', players));
    });

    chat.on('guildMemberLeft', (name: string) => {
      withWin((win) => win.webContents.send('chat:guildMemberLeft', name));
    });

    chat.on('usernameMention', (name: string) => {
      withWin((win) => win.webContents.send('chat:usernameMention', name));
    });
  } catch (err) {
    console.warn('[ChatBridge] Failed to init chat logger:', err);
  }
}
