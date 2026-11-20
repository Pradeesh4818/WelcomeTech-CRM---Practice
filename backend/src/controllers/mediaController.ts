import { Request, Response } from 'express';
import Media from '../models/Media';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { buildUploadUrl, toUploadDiskDir } from '../config/storage';
import fs from 'fs';
import path from 'path';

export const getMedia = asyncHandler(async (req: Request, res: Response) => {
  const { search, type } = req.query;
  const query: any = {};

  if (search) {
    query.name = { $regex: String(search), $options: 'i' };
  }

  if (type && type !== 'all') {
    query.type = type;
  }

  const media = await Media.find(query).sort({ _id: 1 });

  res.status(200).json({
    status: 'success',
    data: media,
  });
});

export const uploadMedia = asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const { url, type, name } = req.body;

  if ((!files || !files.length) && !url) {
    return res.status(400).json({ status: 'error', message: 'No files uploaded or URL provided' });
  }

  const mediaEntries = [];

  if (files && files.length > 0) {
    for (const file of files) {
      let fileType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.mimetype.startsWith('image/')) fileType = 'image';
      else if (file.mimetype.startsWith('video/')) fileType = 'video';
      else if (file.mimetype.startsWith('audio/')) fileType = 'audio';

      const media = await Media.create({
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: buildUploadUrl('media', file.filename),
        key: file.filename,
        type: fileType,
        uploadedBy: req.user?._id,
      });
      mediaEntries.push(media);
    }
  } else if (url && type) {
    const originalName = name || url.split('/').pop() || 'External Asset';
    const media = await Media.create({
      name: originalName,
      originalName: originalName,
      mimeType: 'external/link',
      size: 0,
      url: url,
      key: 'external-' + Date.now(),
      type: type,
      uploadedBy: req.user?._id,
    });
    mediaEntries.push(media);
  }

  res.status(201).json({
    status: 'success',
    data: mediaEntries,
  });
});

export const updateMedia = asyncHandler(async (req: Request, res: Response) => {
  const { name, type, url } = req.body;
  const media = await Media.findById(req.params.id);

  if (!media) {
    return res.status(404).json({ status: 'error', message: 'Media not found' });
  }

  if (name) media.name = name;
  if (type) media.type = type;
  if (url && media.mimeType === 'external/link') media.url = url;

  await media.save();

  res.status(200).json({
    status: 'success',
    data: media,
  });
});

export const deleteMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await Media.findById(req.params.id);
  if (!media) {
    return res.status(404).json({ status: 'error', message: 'Media not found' });
  }

  // Delete physical file using the configured upload root (not a hardcoded path,
  // which silently missed files when UPLOAD_ROOT_DIR was customised).
  const filePath = path.join(toUploadDiskDir('media'), media.key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await media.deleteOne();

  res.status(200).json({
    status: 'success',
    message: 'Media deleted successfully',
  });
});
