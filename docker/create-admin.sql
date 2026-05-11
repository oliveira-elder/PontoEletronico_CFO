DO $$
DECLARE
  v_realm_id  TEXT := '0ea87128-5db6-44ea-abe0-4e391dc009f5';
  v_user_id   TEXT := gen_random_uuid()::text;
  v_cred_id   TEXT := gen_random_uuid()::text;
  v_role_id   TEXT;
  v_ts        BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
BEGIN
  INSERT INTO keycloak.user_entity
    (id, enabled, username, realm_id, email_constraint, email_verified, created_timestamp)
  VALUES
    (v_user_id, true, 'admin', v_realm_id, 'admin@localhost', false, v_ts);

  INSERT INTO keycloak.credential
    (id, credential_data, secret_data, type, user_id, created_date, priority)
  VALUES (
    v_cred_id,
    '{"hashIterations":27500,"algorithm":"pbkdf2-sha256","additionalParameters":{}}',
    '{"value":"8OYxm2SW8LSM323FlWx+irkJf198aMVBdhWL6CANTR/9l2ZOo63OvDq/R7g0A3mwKrAwLlT/1wNTVg5pp2odLA==","salt":"HelKM5yV0f2dhImT53PDQg==","additionalParameters":{}}',
    'password',
    v_user_id,
    v_ts,
    10
  );

  SELECT id INTO v_role_id
  FROM keycloak.keycloak_role
  WHERE name = 'admin' AND realm_id = v_realm_id
  LIMIT 1;

  IF v_role_id IS NOT NULL THEN
    INSERT INTO keycloak.user_role_mapping (role_id, user_id)
    VALUES (v_role_id, v_user_id);
  END IF;

  RAISE NOTICE 'Admin criado: id=%', v_user_id;
END $$;
