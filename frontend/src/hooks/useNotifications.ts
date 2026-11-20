import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';

export interface Notification {
  _id: string;
  type: 'assignment' | 'follow_up_reminder' | 'status_change';
  message: string;
  isRead: boolean;
  createdAt: string;
  lead?: {
    _id: string;
    leadId: string;
    name: string;
  };
}

export const useNotifications = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const res = await api.get('/leads/notifications');
        return (res.data.data || []) as Notification[];
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
        return [];
      }
    },
    refetchInterval: 15000, // Refetch every 15 seconds
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/leads/notifications/${id}/read`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<Notification[]>(['notifications']) || [];
      // Optimistically remove the notification from the unread list
      queryClient.setQueryData<Notification[]>(['notifications'], prev.filter(n => n._id !== id));
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['notifications'], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      try {
        await api.patch('/leads/notifications/read-all');
      } catch {
        const unread = query.data?.filter(n => !n.isRead) || [];
        await Promise.all(unread.map(n => api.patch(`/leads/notifications/${n._id}/read`)));
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<Notification[]>(['notifications']) || [];
      queryClient.setQueryData<Notification[]>(['notifications'], []);
      return { prev };
    },
    onError: (_err, _variables, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['notifications'], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Only keep unread notifications in the list
  const activeNotifications = (query.data || []).filter(n => !n.isRead);
  const unreadCount = activeNotifications.length;

  return {
    notifications: activeNotifications,
    isLoading: query.isLoading,
    unreadCount,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
  };
};
