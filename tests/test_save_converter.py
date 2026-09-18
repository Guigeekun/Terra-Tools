import json
import os
import unittest
from backend.routers.saves import (
    detect_save_format,
    liminal_to_retb,
    retb_to_liminal,
    parse_account_summary_liminal,
    parse_account_summary_retb
)

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "user-data")
TB_TEST_FILE = os.path.join(USER_DATA_DIR, "tb-save-test-2026-09-15.json")
LIMINAL_TEST_FILE = os.path.join(USER_DATA_DIR, "bootstrap-state-liminal.json")


class TestSaveConverter(unittest.TestCase):
    def setUp(self):
        with open(TB_TEST_FILE, "r", encoding="utf-8") as f:
            self.tb_data = json.load(f)
        with open(LIMINAL_TEST_FILE, "r", encoding="utf-8") as f:
            self.liminal_data = json.load(f)

    def test_detect_format(self):
        self.assertEqual(detect_save_format(self.tb_data), "retb")
        self.assertEqual(detect_save_format(self.liminal_data), "liminal")
        self.assertEqual(detect_save_format({"random": "data"}), "unknown")
        self.assertEqual(detect_save_format([]), "unknown")

    def test_inspect_summaries(self):
        tb_summary = parse_account_summary_retb(self.tb_data)
        self.assertEqual(tb_summary["account_id"], "1270FEDAE4415D0DC5048AAE96D969F1")
        self.assertEqual(tb_summary["username"], "test")
        self.assertGreaterEqual(tb_summary["character_count"], 3)
        self.assertEqual(tb_summary["coins"], 104248)

        active_id = self.liminal_data["active_account_id"]
        lim_acc = self.liminal_data["accounts"][active_id]
        lim_summary = parse_account_summary_liminal(active_id, lim_acc)
        self.assertEqual(lim_summary["account_id"], active_id)
        self.assertEqual(lim_summary["character_count"], 141)
        self.assertEqual(lim_summary["buddy_count"], 138)
        self.assertEqual(lim_summary["coins"], 18916)

    def test_summary_items(self):
        # Held items surface as {id, count} pairs with 1-BASED ids:
        # itemList[slot - 1] holds the count of item `slot`.
        item_list = self.liminal_data["accounts"][self.liminal_data["active_account_id"]]["userdata"]["itemList"]
        summary = parse_account_summary_liminal(self.liminal_data["active_account_id"],
                                                self.liminal_data["accounts"][self.liminal_data["active_account_id"]])
        expected = [{"id": idx + 1, "count": int(v)} for idx, v in enumerate(item_list) if v and v > 0]
        self.assertEqual(summary["items"], expected)
        self.assertEqual(len(summary["items"]), summary["item_count"])

        retb_summary = parse_account_summary_retb(self.tb_data)
        session_data = json.loads(self.tb_data["tables"]["session"]["rows"][0][1])
        expected_retb = [{"id": idx + 1, "count": int(v)}
                         for idx, v in enumerate(session_data.get("itemList", [])) if v and v > 0]
        self.assertEqual(retb_summary["items"], expected_retb)

    def test_retb_to_liminal_conversion(self):
        converted = retb_to_liminal(self.tb_data)
        self.assertIn("accounts", converted)
        self.assertIn("active_account_id", converted)
        self.assertEqual(converted["active_account_id"], "1270FEDAE4415D0DC5048AAE96D969F1")
        acc = converted["accounts"]["1270FEDAE4415D0DC5048AAE96D969F1"]
        self.assertEqual(acc["username"], "test")
        self.assertEqual(len(acc["userdata"]["chrdata"]), 4)
        self.assertEqual(acc["userdata"]["coins"], 104248)
        self.assertEqual(acc["userdata"]["freeEnergy"], 64)

    def test_liminal_to_retb_conversion(self):
        active_id = self.liminal_data["active_account_id"]
        converted = liminal_to_retb(self.liminal_data, account_id=active_id)
        self.assertEqual(converted["format"], "retb-save/1")
        self.assertEqual(converted["userid"], active_id)
        self.assertEqual(converted["username"], "Player")
        # Marks the converter version, so output from a stale frontend build
        # (pre-fix bug) is recognizable in the downloaded file.
        self.assertTrue(converted["generator"].startswith("terra-tools/"))
        self.assertIn("tables", converted)
        self.assertIn("users", converted["tables"])
        self.assertIn("characters", converted["tables"])
        self.assertIn("session", converted["tables"])
        self.assertEqual(len(converted["tables"]["characters"]["rows"]), 141)

    def test_roundtrip_retb(self):
        # ReTB -> Liminal -> ReTB
        liminal_rep = retb_to_liminal(self.tb_data)
        retb_rep = liminal_to_retb(liminal_rep)
        self.assertEqual(retb_rep["format"], "retb-save/1")
        self.assertEqual(retb_rep["userid"], self.tb_data["userid"])
        self.assertEqual(retb_rep["username"], self.tb_data["username"])
        self.assertEqual(len(retb_rep["tables"]["characters"]["rows"]), 4)

    def test_roundtrip_liminal(self):
        # Liminal -> ReTB -> Liminal
        active_id = self.liminal_data["active_account_id"]
        retb_rep = liminal_to_retb(self.liminal_data, account_id=active_id)
        liminal_rep = retb_to_liminal(retb_rep)
        self.assertEqual(liminal_rep["active_account_id"], active_id)
        acc = liminal_rep["accounts"][active_id]
        self.assertEqual(acc["userdata"]["coins"], 18916)

    def test_buddy_info_formats(self):
        # Convert Liminal to ReTB -> buddyInfo MUST be a list
        active_id = self.liminal_data["active_account_id"]
        retb_rep = liminal_to_retb(self.liminal_data, account_id=active_id)
        sess = json.loads(retb_rep["tables"]["session"]["rows"][0][1])
        self.assertIsInstance(sess.get("buddyInfo"), list)
        self.assertEqual(len(sess["buddyInfo"]), 138)
        self.assertIsInstance(sess.get("_buddy_compendium"), dict)

        # The compendium is keyed by the buddy SPECIES id (bid) -> highest
        # level ever held. Keying it by the per-copy inventory id (iid) sends
        # ids past the end of the game's BuddyData table in buddyInfo.record,
        # which crashes the client at boot.
        source_info = self.liminal_data["accounts"][active_id]["userdata"]["buddyInfo"]
        expected_species = set()
        for entry in source_info.get("list", []):
            expected_species.add(int(entry["bid"]))
        for entry in source_info.get("record", []):
            if isinstance(entry, dict):
                expected_species.add(int(entry["bid"]))
        compendium = sess["_buddy_compendium"]
        self.assertEqual({int(k) for k in compendium}, expected_species)
        for k, v in compendium.items():
            self.assertIsInstance(v, int)
            self.assertGreaterEqual(v, 1)

        # Convert ReTB to Liminal -> buddyInfo MUST be a dict with 'list' and a
        # record LIST of best-copy entries (the persisted liminal shape).
        lim_rep = retb_to_liminal(retb_rep)
        acc_ud = lim_rep["accounts"][active_id]["userdata"]
        self.assertIsInstance(acc_ud.get("buddyInfo"), dict)
        self.assertIn("list", acc_ud["buddyInfo"])
        self.assertIsInstance(acc_ud["buddyInfo"]["list"], list)
        self.assertEqual(len(acc_ud["buddyInfo"]["list"]), 138)
        record = acc_ud["buddyInfo"]["record"]
        self.assertIsInstance(record, list)
        self.assertGreater(len(record), 0)
        for entry in record:
            self.assertIsInstance(entry, dict)
            self.assertIsInstance(entry["bid"], int)
            self.assertIsInstance(entry["iid"], int)
            self.assertIsInstance(entry["lv"], int)
        record_bids = [entry["bid"] for entry in record]
        self.assertEqual(record_bids, sorted(record_bids))
        self.assertEqual(len(record_bids), len(set(record_bids)))
        self.assertTrue(set(record_bids).issubset(expected_species))

    def test_characters_job_levels_decoded(self):
        # The characters table stores DECODED job levels (plain ints, cap 90),
        # not the packed (exp << 12) | level floats of the client wire (which
        # stay in the session chrdata, where the wire format belongs).
        active_id = self.liminal_data["active_account_id"]
        converted = liminal_to_retb(self.liminal_data, account_id=active_id)
        rows = converted["tables"]["characters"]["rows"]
        self.assertEqual(len(rows), 141)
        for row in rows:
            levels = json.loads(row[5])
            self.assertIsInstance(levels, list)
            for level in levels:
                self.assertIsInstance(level, int)
                self.assertGreaterEqual(level, 0)
                self.assertLessEqual(level, 90)

        sess = json.loads(converted["tables"]["session"]["rows"][0][1])
        packed = sess["chrdata"][0]["jobLevels"]
        self.assertTrue(any(value > 100000 for value in packed))

    def test_retb_to_liminal_userdata_shape(self):
        converted = retb_to_liminal(self.tb_data)
        ud = converted["accounts"]["1270FEDAE4415D0DC5048AAE96D969F1"]["userdata"]
        # Liminal reads the LOWERCASE lastupdate key as a JSON decimal.
        self.assertIsInstance(ud["lastupdate"], float)
        self.assertGreater(ud["lastupdate"], 0.0)
        # Side-world progression derives from the reTB per-world map.
        acc = converted["accounts"]["1270FEDAE4415D0DC5048AAE96D969F1"]
        self.assertIsInstance(acc["world_progress"], dict)
        self.assertNotIn("0", acc["world_progress"])

    def test_client_float_traps(self):
        # The client reads chrdata date/jobLevels/jobSlots, lastupdate and
        # questClearDate values through LitJson double casts -- an integer is
        # a parse failure (liminal save_validation FLOAT_FIELDS), and sources
        # store them either way. The converted session must carry decimals.
        active_id = self.liminal_data["active_account_id"]
        acc = self.liminal_data["accounts"][active_id]
        ud = acc["userdata"]
        ud["chrdata"][0]["date"] = 0
        ud["chrdata"][0]["jobLevels"] = [136036362, 0, 0]
        ud["chrdata"][0]["jobSlots"] = [0, 0, 0]
        ud["lastupdate"] = 1
        ud["questClearDate"] = {"3-5": 1789644130}
        converted = liminal_to_retb(self.liminal_data, account_id=active_id)
        sess = json.loads(converted["tables"]["session"]["rows"][0][1])
        entry = sess["chrdata"][0]
        self.assertIsInstance(entry["date"], float)
        self.assertTrue(all(isinstance(v, float) for v in entry["jobLevels"]))
        self.assertTrue(all(isinstance(v, float) for v in entry["jobSlots"]))
        self.assertIsInstance(sess["lastupdate"], float)
        self.assertTrue(all(isinstance(v, float) for v in sess["questClearDate"].values()))

    def test_user_number_deterministic(self):
        # reTB serves userNumber as the login id (User Info screen, transfer
        # validation expects 9 digits) -- it must not change between runs.
        active_id = self.liminal_data["active_account_id"]
        first = liminal_to_retb(self.liminal_data, account_id=active_id)
        second = liminal_to_retb(self.liminal_data, account_id=active_id)
        num_first = json.loads(first["tables"]["session"]["rows"][0][1])["userNumber"]
        num_second = json.loads(second["tables"]["session"]["rows"][0][1])["userNumber"]
        self.assertEqual(num_first, num_second)
        self.assertEqual(len(num_first), 9)
        self.assertTrue(num_first.isdigit())

    def test_retb_pydantic_schemas(self):
        from pydantic import BaseModel, ConfigDict, Field
        
        class Passthrough(BaseModel):
            model_config = ConfigDict(extra='allow')
        
        class Message(BaseModel):
            model_config = ConfigDict(extra='allow')
        
        class UserData(BaseModel):
            model_config = ConfigDict(extra='allow')
            userid: str
            achievement: Passthrough = Field(default_factory=Passthrough)
            questClearDate: dict[str, float] = Field(default_factory=dict)
            record: list[Passthrough] = Field(default_factory=list)
            messages: list[Message] = Field(default_factory=list)
            multipleFlags: Passthrough = Field(default_factory=Passthrough)

        class SessionState(BaseModel):
            model_config = ConfigDict(extra='allow', populate_by_name=True, validate_assignment=True)
            buddy_compendium: dict[int, int] = Field(default_factory=dict, alias='_buddy_compendium')
            buddyInfo: list[Passthrough] = Field(default_factory=list)

        for aid in self.liminal_data["accounts"]:
            retb_save = liminal_to_retb(self.liminal_data, account_id=aid)
            tables = retb_save["tables"]
            
            # Validate SessionState
            sess = json.loads(tables["session"]["rows"][0][1])
            SessionState.model_validate(sess)
            
            # Validate UserData as ReTB storage.py does
            prog_row = dict(zip(tables["user_progression"]["cols"], tables["user_progression"]["rows"][0]))
            misc_row = dict(zip(tables["user_misc"]["cols"], tables["user_misc"]["rows"][0]))
            
            raw_user = {
                "userid": aid,
                "record": json.loads(prog_row.get("record_json", "[]")),
                "achievement": json.loads(prog_row.get("achievement_json", "{}")),
                "questClearDate": json.loads(prog_row.get("quest_clear_date_json", "{}")),
                "messages": json.loads(misc_row.get("messages_json", "[]")),
                "multipleFlags": json.loads(misc_row.get("multiple_flags_json", "{}")),
            }
            UserData.model_validate(raw_user)




if __name__ == "__main__":
    unittest.main()

