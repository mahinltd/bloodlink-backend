import mongoose from 'mongoose';

const { Schema } = mongoose;

const translationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    group: { type: String, default: 'common', index: true },
    bn: { type: String, required: true },
    en: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

export const Translation = mongoose.model('Translation', translationSchema);