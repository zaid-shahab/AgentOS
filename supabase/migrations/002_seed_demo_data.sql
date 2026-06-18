-- Demo seed data for testing the Insights (Text-to-SQL) tab
-- Run this in Supabase SQL Editor after 001_init.sql

insert into interactions (account_id, platform, sender_id, message, sentiment, intent_tag, action_taken, created_at) values
  ('demo', 'instagram_comment', 'user_001', 'What is the price for the pro plan?',          'Positive',  'Pricing',  'send_dm',       now() - interval '1 hour'),
  ('demo', 'instagram_comment', 'user_002', 'This product is absolute trash, hate it!!!',   'Hostile',   'Troll',    'hide_comment',  now() - interval '2 hours'),
  ('demo', 'instagram_dm',      'user_003', 'Hi, I am interested in buying. Can you help?', 'Positive',  'Lead',     'tag_lead',      now() - interval '3 hours'),
  ('demo', 'instagram_dm',      'user_004', 'How much does shipping cost to Dubai?',        'Neutral',   'Shipping', 'send_dm',       now() - interval '4 hours'),
  ('demo', 'messenger_dm',      'user_005', 'Your support is terrible, I want a refund!',   'Hostile',   'Support',  'alert_webhook', now() - interval '5 hours'),
  ('demo', 'instagram_comment', 'user_006', 'Love your products! Can I get a discount?',    'Positive',  'Pricing',  'send_dm',       now() - interval '6 hours'),
  ('demo', 'instagram_dm',      'user_007', 'Do you ship internationally?',                 'Neutral',   'Shipping', 'send_dm',       now() - interval '7 hours'),
  ('demo', 'messenger_dm',      'user_008', 'I placed an order 2 weeks ago, no update.',    'Negative',  'Support',  'send_dm',       now() - interval '8 hours'),
  ('demo', 'instagram_comment', 'user_009', 'Scam! Do not buy from these people!!!',        'Hostile',   'Troll',    'hide_comment',  now() - interval '9 hours'),
  ('demo', 'instagram_dm',      'user_010', 'What is included in the basic plan?',          'Positive',  'Pricing',  'send_dm',       now() - interval '10 hours'),
  ('demo', 'instagram_comment', 'user_011', 'Just bought it, amazing quality!',             'Positive',  'General',  'no_action',     now() - interval '1 day'),
  ('demo', 'messenger_dm',      'user_012', 'Can I get a bulk discount for 50 units?',      'Positive',  'Lead',     'tag_lead',      now() - interval '1 day'),
  ('demo', 'instagram_comment', 'user_013', 'Is there a free trial available?',             'Neutral',   'Pricing',  'send_dm',       now() - interval '2 days'),
  ('demo', 'instagram_dm',      'user_014', 'My package arrived damaged.',                  'Negative',  'Support',  'alert_webhook', now() - interval '2 days'),
  ('demo', 'messenger_dm',      'user_015', 'I want to become a reseller.',                 'Positive',  'Lead',     'tag_lead',      now() - interval '3 days');

insert into leads (account_id, sender_id, message, intent_tag, created_at) values
  ('demo', 'user_003', 'Hi, I am interested in buying. Can you help?', 'Lead',    now() - interval '3 hours'),
  ('demo', 'user_012', 'Can I get a bulk discount for 50 units?',      'Lead',    now() - interval '1 day'),
  ('demo', 'user_015', 'I want to become a reseller.',                  'Lead',    now() - interval '3 days');
