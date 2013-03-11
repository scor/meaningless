#!/usr/bin/env python

from google.appengine.ext import ndb

import jinja2
import json
import logging
import os
import uuid
import webapp2
import base64

import datamodel

templateEnv = jinja2.Environment(
  loader = jinja2.FileSystemLoader(
    os.path.join(os.path.dirname(__file__), "templates")
  )
)
templateEnv.globals["version"] = os.environ["CURRENT_VERSION_ID"].split('.')[0]
templateEnv.globals["app"] = os.environ["APPLICATION_ID"]

class BaseHandler(webapp2.RequestHandler):
  def get(self):
    template = templateEnv.get_template("default.html")
    self.response.write(template.render({}))

class MainHandler(BaseHandler):
  pass

class ReportUploadHandler(webapp2.RequestHandler):

  def post(self):
    # FIXME: use self.request.get() to clamp to post() requests later.

    # FIXME: need better abuse controls rate limiting. A Memcache of recent seen
    # client IPs is probably a reasonable first step.
    data = None
    reportId = uuid.uuid4().hex
    if "data" in self.request.params:
      data = json.loads(self.request.params["data"],
                        object_hook=datamodel.fromJSON)
      data.reportId = reportId

    if data is None:
      return self.redirect("/global")

    # Only persist our report after sanity checks.
    if not data.isSane():
      # TODO: display some sort of failure message
      pass

    future = data.put_async()

    if self.request.get("showReport") == "false":
      # The extension uploaded it and doesn't want us to generate a view, so
      # send back a status code
      self.response.write(json.dumps({
        "status": "success",
        "error": None,
        "reportId": reportId,
        "reportURL": "/report/%s" % (base64.urlsafe_b64encode(reportId),)
      }));
    else:
      # reportId = base64.urlsafe_b64encode(id.bytes)
      # Log the data and redirect to a report.
      dest = "/report/%s" % (base64.urlsafe_b64encode(reportId),)
      self.redirect(dest)

    future.get_result()

  def get(self):
    return self.post()

class ReportViewHandler(BaseHandler):
  def get(self, id=''):
    try:
      id = base64.urlsafe_b64decode(id)
      query = datamodel.ReportData.query(datamodel.ReportData.reportId == id)
      data = query.fetch(1)[0]
      # logging.info(data)
      template = templateEnv.get_template("report.html")
      self.response.write(template.render({
        # NOTE: we assume that jinja2 HTML escapes all content for us, letting
        # us not worry about XSS from this
        "params": self.request.params,
        "id": id,
        "content": data
      }))
    except:
      template = templateEnv.get_template("report.html")
      self.response.write(template.render({ "error": "Report not found!" }))

class TrendsHandler(BaseHandler):
  pass

class GlobalStatsHandler(BaseHandler):

  @ndb.tasklet
  def globalMetrics(self):
    metrics = datamodel.TimeSliceMetrics.empty()
    qry = datamodel.ReportData.query().order(datamodel.ReportData.date)
    qit = qry.iter()
    while (yield qit.has_next_async()):
      next = qit.next()
      # logging.info("----------------------------------------")
      # logging.info("| Next:")
      logging.info(next.delta)
      metrics.totals += next.totals
      # metrics += next

    raise ndb.Return(metrics)

  def get(self):
    # Until we get this cron'd, query the entire datas set, generate
    # TimeSliceMetrics from it, and format them for display.
    metrics = self.globalMetrics().get_result()

    template = templateEnv.get_template("report.html")
    self.response.write(template.render({ "content": metrics }))

class ExtensionHandler(BaseHandler):
  def get(self):
    template = templateEnv.get_template("extension.html")
    self.response.write(template.render({}))

class PrivacyHandler(BaseHandler):
  pass

class AboutHandler(BaseHandler):
  pass

class TaskHandler(BaseHandler):
  def get(self, name="daily"):
    pass

app = webapp2.WSGIApplication([
  ("/", MainHandler),
  ("/report", ReportUploadHandler),
  (r"/report/(.+)", ReportViewHandler),
  ("/trends", TrendsHandler),
  ("/global", GlobalStatsHandler),
  ("/extension", ExtensionHandler),
  ("/privacy", PrivacyHandler),
  ("/about", AboutHandler),
  ("/task/(.+)", TaskHandler),
], debug=True)
