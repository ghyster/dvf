from flask import Flask, request, send_from_directory, jsonify
import json
import pandas as pd
from sqlalchemy import create_engine

pd.set_option('display.max_rows', 1000)
pd.set_option('display.max_columns', 500)
pd.set_option('display.width', 1000)
pd.set_option('precision', 0)

app = Flask(__name__, static_url_path='')

config = pd.read_csv('config.csv', header=None)
id = config[0][0]
pwd = config[0][1]
host = config[0][2]
db = config[0][3]
engine = create_engine('mysql+pymysql://%s:%s@%s/%s?charset=utf8mb4'%(id, pwd, host, db))

@app.route('/')
def root():
	return app.send_static_file('index.html')

@app.route('/css/<path:path>')
def send_css(path):
	return send_from_directory('static/css', path)


@app.route('/js/<path:path>')
def send_js(path):
	return send_from_directory('static/js', path)

@app.route('/donneesgeo/<path:path>')
def send_donneesgeo(path):
	return send_from_directory('static/donneesgeo', path)

@app.route('/api/dates2')
def dates():
	dateMin = pd.read_sql("""SELECT min(date_mutation) as min FROM dvf """, engine)
	dateMax = pd.read_sql("""SELECT max(date_mutation) as max FROM dvf """, engine)
	return '{"min": "' + str(dateMin['min'][0]) + '", "max": "' + str(dateMax['max'][0]) + '"}'    

@app.route('/api/mutations3/<commune>/<sectionPrefixee>')
def get_mutations3(commune, sectionPrefixee):
	mutations = pd.read_sql("""SELECT * FROM dvf WHERE code_commune = %(code)s AND section_prefixe = %(sectionPrefixee)s""", engine, params = {"code": commune, "sectionPrefixee" : sectionPrefixee})
	mutations = mutations.applymap(str) # Str pour éviter la conversion des dates en millisecondes.
	mutations = mutations.sort_values(by=['date_mutation', 'code_type_local'], ascending=[False, True])
	json_mutations = '{"mutations": ' + mutations.to_json(orient = 'records') + '}'
	return json_mutations