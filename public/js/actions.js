import { apiPost } from './api.js';
import { navigate } from './router.js';
import { showError } from './ui.js';

export async function openConversationWithUser(userId) {
  try {
    const data = await apiPost('conversations', 'open', { user_id: Number(userId) });
    navigate('chat', { id: data.conversation.id });
    return data.conversation;
  } catch (error) {
    showError(error);
    return null;
  }
}

export async function setFollowing(userId, follow) {
  try {
    const data = await apiPost('friends', follow ? 'follow' : 'unfollow', { user_id: Number(userId) });
    return data;
  } catch (error) {
    showError(error);
    return null;
  }
}
