def get_user_records(conn, user_id):
  query = "SELECT * FROM users WHERE id = " + user_id
  cursor = conn.cursor()
  rows = cursor.execute(query).fetchall()
  result=[]
  for row in rows:
    for other in rows:
      if row[0]==other[0]:
        result.append({"id":row[0],"name":row[1]})
  return result
