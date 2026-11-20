import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';

export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  body: string;
}

export const useEmailTemplates = () => {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const res = await api.get('/email-templates');
      return (res.data.data || []) as EmailTemplate[];
    },
  });
};

export const useSendEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, cc, templateId, dynamicData }: { email: string | string[]; cc?: string[]; templateId: string; dynamicData: any }) => {
      const res = await api.post('/email-templates/send', {
        to: email,
        cc,
        templateId,
        dynamicData,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email sent successfully');
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
      queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
      queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
    },
    onError: (error: any) => {
      console.error('Email send error:', error);
      toast.error(error.response?.data?.message || 'Failed to send email');
    },
  });
};
