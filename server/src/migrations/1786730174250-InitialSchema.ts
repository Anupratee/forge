import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786730174250 implements MigrationInterface {
  name = 'InitialSchema1786730174250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "challenge_check_ins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "participation_id" uuid NOT NULL, "check_in_date" date NOT NULL, "note" text, "proof_image" character varying(255), CONSTRAINT "uq_check_in_participation_date" UNIQUE ("participation_id", "check_in_date"), CONSTRAINT "PK_3b7ca7b932e606e0d12b4cd2e23" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."challenge_participations_status_enum" AS ENUM('ACTIVE', 'COMPLETED', 'WITHDRAWN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "challenge_participations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "challenge_id" uuid NOT NULL, "user_id" uuid NOT NULL, "status" "public"."challenge_participations_status_enum" NOT NULL DEFAULT 'ACTIVE', "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_participation_challenge_user" UNIQUE ("challenge_id", "user_id"), CONSTRAINT "PK_0189680b469e66abe5de8cb6d8c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_participation_user_status" ON "challenge_participations" ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."challenges_category_enum" AS ENUM('ART', 'FITNESS', 'FINANCE', 'LEARNING', 'WELLNESS', 'PRODUCTIVITY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."challenges_status_enum" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "challenges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(140) NOT NULL, "description" text NOT NULL, "category" "public"."challenges_category_enum" NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "capacity" integer NOT NULL, "points_reward" integer NOT NULL, "cover_image" character varying(255), "status" "public"."challenges_status_enum" NOT NULL DEFAULT 'DRAFT', "rejection_reason" text, "created_by" uuid NOT NULL, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_challenges_points_reward_non_negative" CHECK ("points_reward" >= 0), CONSTRAINT "ck_challenges_capacity_positive" CHECK ("capacity" > 0), CONSTRAINT "ck_challenges_date_window" CHECK ("end_date" > "start_date"), CONSTRAINT "PK_1e664e93171e20fe4d6125466af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_challenges_created_by" ON "challenges" ("created_by") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_challenges_status_category" ON "challenges" ("status", "category") `,
    );
    await queryRunner.query(
      `CREATE TABLE "habit_completions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "habit_id" uuid NOT NULL, "completed_on" date NOT NULL, "note" text, CONSTRAINT "uq_habit_completion_habit_date" UNIQUE ("habit_id", "completed_on"), CONSTRAINT "PK_6cd5cba8604717303b951f3aa1c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."habits_category_enum" AS ENUM('HEALTH', 'FITNESS', 'FINANCE', 'LEARNING', 'MINDFULNESS', 'PRODUCTIVITY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "habits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "description" text, "category" "public"."habits_category_enum" NOT NULL, "target_per_week" integer NOT NULL DEFAULT '7', "icon_image" character varying(255), "is_archived" boolean NOT NULL DEFAULT false, "user_id" uuid NOT NULL, CONSTRAINT "ck_habits_target_per_week_range" CHECK ("target_per_week" BETWEEN 1 AND 7), CONSTRAINT "PK_b3ec33c2d7af69d09fcf4af7e39" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_habits_user_archived" ON "habits" ("user_id", "is_archived") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."points_ledger_reason_enum" AS ENUM('HABIT_COMPLETION', 'HABIT_STREAK_BONUS', 'CHALLENGE_CHECK_IN', 'CHALLENGE_COMPLETION', 'BUDGET_ADHERENCE', 'REDEMPTION', 'ADMIN_ADJUSTMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."points_ledger_reference_type_enum" AS ENUM('HABIT_COMPLETION', 'CHALLENGE_CHECK_IN', 'CHALLENGE_PARTICIPATION', 'BUDGET_GOAL', 'REDEMPTION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "points_ledger" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "amount" integer NOT NULL, "reason" "public"."points_ledger_reason_enum" NOT NULL, "reference_type" "public"."points_ledger_reference_type_enum", "reference_id" uuid, "description" character varying(200), CONSTRAINT "uq_points_ledger_reference" UNIQUE ("reference_type", "reference_id", "reason"), CONSTRAINT "ck_points_ledger_amount_non_zero" CHECK ("amount" <> 0), CONSTRAINT "PK_1894c07f712716bfe637e82cc05" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_points_ledger_user_created_at" ON "points_ledger" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reward_items_type_enum" AS ENUM('COSMETIC', 'VOUCHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reward_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "description" text NOT NULL, "type" "public"."reward_items_type_enum" NOT NULL, "points_cost" integer NOT NULL, "stock" integer NOT NULL, "image" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "cosmetic_theme" jsonb, "created_by" uuid NOT NULL, CONSTRAINT "ck_reward_items_stock_non_negative" CHECK ("stock" >= 0), CONSTRAINT "ck_reward_items_points_cost_positive" CHECK ("points_cost" > 0), CONSTRAINT "PK_af31aa03d86d0ba1ea606dd971b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reward_items_active_type" ON "reward_items" ("is_active", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "redemptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "reward_item_id" uuid NOT NULL, "points_spent" integer NOT NULL, "voucher_code" character varying(32), CONSTRAINT "ck_redemptions_points_spent_positive" CHECK ("points_spent" > 0), CONSTRAINT "PK_def143ab94376fea5985bb04219" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_redemptions_user_created_at" ON "redemptions" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'CREATOR', 'USER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "password_hash" character varying(60) NOT NULL, "display_name" character varying(80) NOT NULL, "bio" text, "avatar_image" character varying(255), "role" "public"."users_role_enum" NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "leaderboard_opt_in" boolean NOT NULL DEFAULT false, "last_login_at" TIMESTAMP WITH TIME ZONE, "equipped_redemption_id" uuid, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
    await queryRunner.query(`CREATE INDEX "ix_users_role" ON "users" ("role") `);
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_category_enum" AS ENUM('FOOD', 'HOUSING', 'TRANSPORT', 'UTILITIES', 'HEALTH', 'ENTERTAINMENT', 'EDUCATION', 'SHOPPING', 'SAVINGS', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_source_enum" AS ENUM('MANUAL', 'CSV_IMPORT', 'AI_IMPORT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(140) NOT NULL, "description" text, "amount" numeric(12,2) NOT NULL, "category" "public"."expenses_category_enum" NOT NULL, "spent_on" date NOT NULL, "receipt_image" character varying(255), "source" "public"."expenses_source_enum" NOT NULL DEFAULT 'MANUAL', "user_id" uuid NOT NULL, CONSTRAINT "ck_expenses_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_expenses_user_category" ON "expenses" ("user_id", "category") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_expenses_user_spent_on" ON "expenses" ("user_id", "spent_on") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."budget_goals_category_enum" AS ENUM('FOOD', 'HOUSING', 'TRANSPORT', 'UTILITIES', 'HEALTH', 'ENTERTAINMENT', 'EDUCATION', 'SHOPPING', 'SAVINGS', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "budget_goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(140) NOT NULL, "description" text, "category" "public"."budget_goals_category_enum" NOT NULL, "period_month" date NOT NULL, "limit_amount" numeric(12,2) NOT NULL, "attachment" character varying(255), "user_id" uuid NOT NULL, CONSTRAINT "uq_budget_goal_user_month_category" UNIQUE ("user_id", "period_month", "category"), CONSTRAINT "ck_budget_goals_limit_positive" CHECK ("limit_amount" > 0), CONSTRAINT "ck_budget_goals_period_is_month_start" CHECK (EXTRACT(DAY FROM "period_month") = 1), CONSTRAINT "PK_1ec37772befcc60b103d2e1481c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_check_ins" ADD CONSTRAINT "FK_d63e4e8dde65d7e7670ad218552" FOREIGN KEY ("participation_id") REFERENCES "challenge_participations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_participations" ADD CONSTRAINT "FK_ffb01fcefddc84e1615251bf6a6" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_participations" ADD CONSTRAINT "FK_d5bfb647637e97f70a8316ccd42" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenges" ADD CONSTRAINT "FK_1e1f02fc7bc2f3a792ecb0ad58e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenges" ADD CONSTRAINT "FK_4bb7c369bfdfe155a967241b16c" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "habit_completions" ADD CONSTRAINT "FK_074ec16420ef7425e584774ee03" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "habits" ADD CONSTRAINT "FK_652ea1f27d16800eca4259546a1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" ADD CONSTRAINT "FK_da695f16d02317721eb76711fec" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_items" ADD CONSTRAINT "FK_a3317b5005cdd200c5ec6af29e0" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "redemptions" ADD CONSTRAINT "FK_c59b27ed1a764e578add290572c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "redemptions" ADD CONSTRAINT "FK_f707a8f9e798bf390fc7c7c107f" FOREIGN KEY ("reward_item_id") REFERENCES "reward_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_7a2528c26139e422f2904ca89ba" FOREIGN KEY ("equipped_redemption_id") REFERENCES "redemptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_49a0ca239d34e74fdc4e0625a78" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "budget_goals" ADD CONSTRAINT "FK_7f5bcbaefaeb6ee6a3686e8dbb3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "budget_goals" DROP CONSTRAINT "FK_7f5bcbaefaeb6ee6a3686e8dbb3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_49a0ca239d34e74fdc4e0625a78"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7a2528c26139e422f2904ca89ba"`);
    await queryRunner.query(
      `ALTER TABLE "redemptions" DROP CONSTRAINT "FK_f707a8f9e798bf390fc7c7c107f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "redemptions" DROP CONSTRAINT "FK_c59b27ed1a764e578add290572c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_items" DROP CONSTRAINT "FK_a3317b5005cdd200c5ec6af29e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "points_ledger" DROP CONSTRAINT "FK_da695f16d02317721eb76711fec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "habits" DROP CONSTRAINT "FK_652ea1f27d16800eca4259546a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "habit_completions" DROP CONSTRAINT "FK_074ec16420ef7425e584774ee03"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenges" DROP CONSTRAINT "FK_4bb7c369bfdfe155a967241b16c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenges" DROP CONSTRAINT "FK_1e1f02fc7bc2f3a792ecb0ad58e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_participations" DROP CONSTRAINT "FK_d5bfb647637e97f70a8316ccd42"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_participations" DROP CONSTRAINT "FK_ffb01fcefddc84e1615251bf6a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "challenge_check_ins" DROP CONSTRAINT "FK_d63e4e8dde65d7e7670ad218552"`,
    );
    await queryRunner.query(`DROP TABLE "budget_goals"`);
    await queryRunner.query(`DROP TYPE "public"."budget_goals_category_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_expenses_user_spent_on"`);
    await queryRunner.query(`DROP INDEX "public"."ix_expenses_user_category"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_source_enum"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_category_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_users_role"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_redemptions_user_created_at"`);
    await queryRunner.query(`DROP TABLE "redemptions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_reward_items_active_type"`);
    await queryRunner.query(`DROP TABLE "reward_items"`);
    await queryRunner.query(`DROP TYPE "public"."reward_items_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_points_ledger_user_created_at"`);
    await queryRunner.query(`DROP TABLE "points_ledger"`);
    await queryRunner.query(`DROP TYPE "public"."points_ledger_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."points_ledger_reason_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_habits_user_archived"`);
    await queryRunner.query(`DROP TABLE "habits"`);
    await queryRunner.query(`DROP TYPE "public"."habits_category_enum"`);
    await queryRunner.query(`DROP TABLE "habit_completions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_challenges_status_category"`);
    await queryRunner.query(`DROP INDEX "public"."ix_challenges_created_by"`);
    await queryRunner.query(`DROP TABLE "challenges"`);
    await queryRunner.query(`DROP TYPE "public"."challenges_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."challenges_category_enum"`);
    await queryRunner.query(`DROP INDEX "public"."ix_participation_user_status"`);
    await queryRunner.query(`DROP TABLE "challenge_participations"`);
    await queryRunner.query(`DROP TYPE "public"."challenge_participations_status_enum"`);
    await queryRunner.query(`DROP TABLE "challenge_check_ins"`);
  }
}
