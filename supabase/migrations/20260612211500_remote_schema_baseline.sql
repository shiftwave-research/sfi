


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_next_participant_id"("dep_id" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  next_num int;
BEGIN
  INSERT INTO deployment_sequences (deployment_id, next_val)
  VALUES (dep_id, 2)
  ON CONFLICT (deployment_id) DO UPDATE
    SET next_val = deployment_sequences.next_val + 1
  RETURNING next_val - 1 INTO next_num;

  RETURN 'P-' || LPAD(next_num::text, 3, '0');
END;
$$;


ALTER FUNCTION "public"."get_next_participant_id"("dep_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."deployment_sequences" (
    "deployment_id" "text" NOT NULL,
    "next_val" integer DEFAULT 1
);


ALTER TABLE "public"."deployment_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deployment_id" "text" NOT NULL,
    "participant_id" "text" NOT NULL,
    "name_normalized" "text" NOT NULL,
    "age" integer,
    "sex" "text",
    "consented_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."participant_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deployment_id" "text" NOT NULL,
    "participant_id" "text" NOT NULL,
    "timing" "text",
    "protocol" "text",
    "session_id" "text",
    "valence" double precision,
    "arousal" double precision,
    "valence_category" "text",
    "arousal_category" "text",
    "affect_quadrant" "text",
    "body_tension" double precision,
    "energy" double precision,
    "body_connection" double precision,
    "clarity" double precision,
    "mental_quiet" double precision,
    "alertness" double precision,
    "pain" double precision,
    "pain_category" "text",
    "stai_calm" integer,
    "stai_tense" integer,
    "stai_upset" integer,
    "stai_relaxed" integer,
    "stai_content" integer,
    "stai_worried" integer,
    "stai6_sum" integer,
    "stai20_equivalent" double precision,
    "stai_category" "text",
    "comment" "text",
    "consent" "text",
    "age" integer,
    "sex" "text",
    "addons" "jsonb",
    "client_timestamp" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."deployment_sequences"
    ADD CONSTRAINT "deployment_sequences_pkey" PRIMARY KEY ("deployment_id");



ALTER TABLE ONLY "public"."participant_keys"
    ADD CONSTRAINT "participant_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



CREATE POLICY "anon can delete test sessions" ON "public"."sessions" FOR DELETE TO "anon" USING (("comment" = '__SFI_TEST__'::"text"));



CREATE POLICY "anon can select sessions" ON "public"."sessions" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."deployment_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_participant_id"("dep_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_participant_id"("dep_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_participant_id"("dep_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."deployment_sequences" TO "anon";
GRANT ALL ON TABLE "public"."deployment_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."deployment_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."participant_keys" TO "anon";
GRANT ALL ON TABLE "public"."participant_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_keys" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







