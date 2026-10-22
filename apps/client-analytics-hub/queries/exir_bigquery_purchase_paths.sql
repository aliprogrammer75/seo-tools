-- Exir.vip | GA4 BigQuery daily export → privacy-minimized purchase journey rows
-- Prerequisite: GA4 property 559100143 linked to GCP project seo-tools-internal
-- Dataset: analytics_559100143 created by GA4 after linking (not yet verified).
-- IMPORTANT: change date window and run only once the BigQuery GA4 events_* tables exist.
DECLARE start_suffix STRING DEFAULT '20261022';
DECLARE end_suffix STRING DEFAULT '20261023';

WITH relevant_events AS (
  SELECT
    event_timestamp,
    event_name,
    user_pseudo_id,
    (SELECT p.value.int_value FROM UNNEST(event_params) p
      WHERE p.key = 'ga_session_id' LIMIT 1) AS ga_session_id,
    NULLIF(COALESCE(
      NULLIF(ecommerce.transaction_id, ''),
      (SELECT p.value.string_value FROM UNNEST(event_params) p
       WHERE p.key='transaction_id' LIMIT 1)
    ),'') AS transaction_id,
    REGEXP_EXTRACT(
      (SELECT p.value.string_value FROM UNNEST(event_params) p
       WHERE p.key='page_location' LIMIT 1),
      r'^https?://[^/]+(/[^?#]*)'
    ) AS original_path,
    ARRAY(
      SELECT item.item_name FROM UNNEST(items) item
      WHERE item.item_name IS NOT NULL LIMIT 20
    ) AS item_names
  FROM `seo-tools-internal.analytics_559100143.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_suffix AND end_suffix
    AND event_name IN (
      'session_start','page_view','view_item_list','select_item','view_item',
      'add_to_cart','view_cart','begin_checkout','add_shipping_info',
      'add_payment_info','purchase'
    )
    AND user_pseudo_id IS NOT NULL
),
purchase_sessions AS (
  SELECT
    transaction_id,
    user_pseudo_id,
    ga_session_id,
    MAX(event_timestamp) AS purchase_at
  FROM relevant_events
  WHERE event_name='purchase'
    AND transaction_id IS NOT NULL
    AND REGEXP_CONTAINS(transaction_id,r'^[0-9]{3,15}$')
    AND ga_session_id IS NOT NULL
  GROUP BY transaction_id,user_pseudo_id,ga_session_id
)
SELECT
  p.transaction_id AS order_number,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ',TIMESTAMP_MICROS(e.event_timestamp)) AS event_time,
  e.event_name,
  CASE
    WHEN e.original_path IS NULL THEN '/'
    WHEN REGEXP_CONTAINS(e.original_path,r'^/(product|product-category|blog|shop|cart|checkout|brand)(/|$)')
         OR e.original_path='/' THEN LEFT(e.original_path,350)
    ELSE '/other'
  END AS page_path,
  e.item_names AS items
FROM purchase_sessions p
JOIN relevant_events e
  ON p.user_pseudo_id=e.user_pseudo_id
  AND p.ga_session_id=e.ga_session_id
  AND e.event_timestamp<=p.purchase_at
  AND (e.event_name<>'purchase' OR e.transaction_id=p.transaction_id)
ORDER BY order_number,event_time,event_name;
